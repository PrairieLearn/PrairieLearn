import type * as stream from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { NoSuchKey, S3 } from '@aws-sdk/client-s3';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import type { PageAuthzData } from '../../lib/authz-data-lib.js';
import { makeS3ClientConfig } from '../../lib/aws.js';
import type { RawStaffUser } from '../../lib/client/safe-db-types.js';

import {
  type GradingJobRow,
  GradingJobRowSchema,
  InstructorGradingJob,
} from './instructorGradingJob.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Asserts that the user has access to the grading job.
 *
 * Throws an error if the user does not have access to the grading job.
 */
function assertHasAccessToGradingJob(authzData: PageAuthzData, gradingJobRow: GradingJobRow) {
  const courseAuthorized = authzData.has_course_permission_preview;

  // 'has_course_instance_permission_view' may be null on course pages.
  const courseInstanceAuthorized = authzData.has_course_instance_permission_view ?? false;

  const needsStudentDataViewerAccess = userNeedsStudentDataViewerAccess(
    authzData.user,
    gradingJobRow,
  );

  const authorized = run(() => {
    if (needsStudentDataViewerAccess) {
      return courseInstanceAuthorized;
    }
    return courseAuthorized || courseInstanceAuthorized;
  });

  if (!authorized) {
    if (needsStudentDataViewerAccess) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    throw new error.HttpStatusError(
      403,
      'Access denied (must be a course previewer or student data viewer)',
    );
  }
}

/**
 * Checks if a user needs student data viewer access to view a grading job.
 *
 * Assessment instances have an additional restriction: they must be accessed by a student data viewer,
 * or the owner of the assessment instance.
 */
function userNeedsStudentDataViewerAccess(user: RawStaffUser, gradingJobRow: GradingJobRow) {
  // If we don't have an assessment and assessment instance, they don't need student data viewer access
  if (gradingJobRow.assessment == null || gradingJobRow.assessment_instance == null) {
    return false;
  }
  if (gradingJobRow.assessment.group_work) {
    // If there are no users in the group, the user needs student data viewer access
    if (gradingJobRow.assessment_instance_group_users == null) {
      return true;
    }
    // If the user doesn't match any of the group users, they need student data viewer access
    return gradingJobRow.assessment_instance_group_users.some(
      (groupUser) => groupUser.user_id !== user.user_id,
    );
  }
  // If the user is not the owner, they need student data viewer access
  return gradingJobRow.assessment_instance.user_id !== user.user_id;
}

router.get(
  '/:job_id(\\d+)',
  asyncHandler(async (req, res) => {
    const gradingJobRow = await sqldb.queryOptionalRow(
      sql.select_job,
      {
        job_id: req.params.job_id,
        course_instance_id: res.locals.course_instance?.id ?? null,
        course_id: res.locals.course.id,
      },
      GradingJobRowSchema,
    );
    if (gradingJobRow === null) {
      throw new error.HttpStatusError(404, 'Job not found');
    }

    assertHasAccessToGradingJob(res.locals.authz_data, gradingJobRow);

    res.send(InstructorGradingJob({ resLocals: res.locals, gradingJobRow }));
  }),
);

router.get(
  '/:job_id(\\d+)/file/:file',
  asyncHandler(async (req, res) => {
    const file = req.params.file;
    const allowList = res.locals.authz_data.has_course_permission_view
      ? ['job.tar.gz', 'archive.tar.gz', 'output.log', 'results.json']
      : ['output.log', 'results.json'];

    if (!allowList.includes(file)) {
      throw new error.HttpStatusError(404, `Unknown file ${file}`);
    }

    const gradingJobRow = await sqldb.queryOptionalRow(
      sql.select_job,
      {
        job_id: req.params.job_id,
        course_instance_id: res.locals.course_instance?.id ?? null,
        course_id: res.locals.course.id,
      },
      GradingJobRowSchema,
    );
    if (gradingJobRow === null) {
      throw new error.HttpStatusError(404, 'Job not found');
    }

    assertHasAccessToGradingJob(res.locals.authz_data, gradingJobRow);

    const grading_job = gradingJobRow.grading_job;

    if (!grading_job.s3_bucket || !grading_job.s3_root_key) {
      throw new Error(`Job ${grading_job.id} does not have any files stored in S3.`);
    }

    res.attachment(file);

    const s3 = new S3(makeS3ClientConfig());
    try {
      const s3Object = await s3.getObject({
        Bucket: grading_job.s3_bucket,
        Key: `${grading_job.s3_root_key}/${file}`,
      });

      if (s3Object.Body === undefined) {
        throw new Error(
          `S3 object ${grading_job.s3_bucket}/${grading_job.s3_root_key}/${file} has no body.`,
        );
      }
      return pipeline(s3Object.Body as stream.Readable, res);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        res.status(404).send();
      } else {
        throw err;
      }
    }
  }),
);

export default router;
