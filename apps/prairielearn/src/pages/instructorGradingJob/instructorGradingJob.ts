import type * as stream from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { NoSuchKey, S3 } from '@aws-sdk/client-s3';
import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { makeS3ClientConfig } from '../../lib/aws.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import type { ResLocalsForPage } from '../../lib/res-locals.types.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

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
async function assertHasAccessToGradingJob(
  resLocals: ResLocalsForPage['course'] | ResLocalsForPage['course-instance'],
  gradingJobRow: GradingJobRow,
) {
  // We'll reuse the variant access logic to gate access. This will let us know
  // whether this specific user should have access to this specific variant.
  //
  // We don't have to have separate checks for course/instance permissions. This
  // page is only visible to users with some kind of instructor-level permissions.
  await selectAndAuthzVariant({
    unsafe_variant_id: gradingJobRow.variant_id,
    variant_course: resLocals.course,
    course_instance_id: 'course_instance' in resLocals ? resLocals.course_instance.id : undefined,
    question_id: gradingJobRow.question_id,
    // IMPORTANT: We pass `undefined` here to indicate that we haven't yet authenticated
    // that the current user should have access to this instance question. This forces
    // the function to evaluate that for us.
    instance_question_id: undefined,
    authz_data: resLocals.authz_data,
    authn_user: resLocals.authn_user,
    user: resLocals.user,
    is_administrator: resLocals.is_administrator,
  });
}

router.get(
  '/:job_id(\\d+)',
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    const gradingJobRow = await sqldb.queryOptionalRow(
      sql.select_job,
      {
        job_id: req.params.job_id,
        course_instance_id: 'course_instance' in res.locals ? res.locals.course_instance.id : null,
        course_id: res.locals.course.id,
      },
      GradingJobRowSchema,
    );
    if (gradingJobRow === null) {
      throw new HttpStatusError(404, 'Job not found');
    }

    await assertHasAccessToGradingJob(res.locals, gradingJobRow);

    res.send(InstructorGradingJob({ resLocals: res.locals, gradingJobRow }));
  }),
);

router.get(
  '/:job_id(\\d+)/file/:file',
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    const file = req.params.file;
    const allowList = res.locals.authz_data.has_course_permission_view
      ? ['job.tar.gz', 'archive.tar.gz', 'output.log', 'results.json']
      : ['output.log', 'results.json'];

    if (!allowList.includes(file)) {
      throw new HttpStatusError(404, `Unknown file ${file}`);
    }

    const gradingJobRow = await sqldb.queryOptionalRow(
      sql.select_job,
      {
        job_id: req.params.job_id,
        course_instance_id: 'course_instance' in res.locals ? res.locals.course_instance.id : null,
        course_id: res.locals.course.id,
      },
      GradingJobRowSchema,
    );
    if (gradingJobRow === null) {
      throw new HttpStatusError(404, 'Job not found');
    }

    await assertHasAccessToGradingJob(res.locals, gradingJobRow);

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
