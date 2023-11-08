import * as express from 'express';
import { pipeline } from 'node:stream/promises';
import { S3, NoSuchKey } from '@aws-sdk/client-s3';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import asyncHandler = require('express-async-handler');
import type * as stream from 'node:stream';

import { makeS3ClientConfig } from '../../lib/aws';
import { InstructorGradingJob, GradingJobQueryResultSchema } from './instructorGradingJob.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/:job_id',
  asyncHandler(async (req, res) => {
    const gradingJobQueryResult = await sqldb.queryOptionalRow(
      sql.select_job,
      {
        job_id: req.params.job_id,
        course_instance_id: res.locals.course_instance?.id ?? null,
        course_id: res.locals.course.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
      },
      GradingJobQueryResultSchema,
    );
    if (gradingJobQueryResult === null) {
      throw error.make(404, 'Job not found');
    }

    // If the grading job is associated with an assessment instance (through a
    // submission, a variant, and an instance question), then we need to check
    // if the effective user is authorized to view this assessment instance.
    //
    // The way we implement this check right now with authz_assessment_instance
    // is overkill, yes, but is easy and robust (we hope).
    if (gradingJobQueryResult.aai && !gradingJobQueryResult.aai.authorized) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    res.send(InstructorGradingJob({ resLocals: res.locals, gradingJobQueryResult }));
  }),
);

router.get(
  '/:job_id/file/:file',
  asyncHandler(async (req, res) => {
    const file = req.params.file;
    const allowList = res.locals.authz_data.has_course_permission_view
      ? ['job.tar.gz', 'archive.tar.gz', 'output.log', 'results.json']
      : ['output.log', 'results.json'];

    if (allowList.indexOf(file) === -1) {
      throw error.make(404, `Unknown file ${file}`);
    }

    const gradingJobQueryResult = await sqldb.queryOptionalRow(
      sql.select_job,
      {
        job_id: req.params.job_id,
        course_instance_id: res.locals.course_instance?.id ?? null,
        course_id: res.locals.course.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
      },
      GradingJobQueryResultSchema,
    );
    if (gradingJobQueryResult === null) {
      throw error.make(404, 'Job not found');
    }
    // If the grading job is associated with an assessment instance (through a
    // submission, a variant, and an instance question), then we need to check
    // if the effective user is authorized to view this assessment instance.
    //
    // The way we implement this check right now with authz_assessment_instance
    // is overkill, yes, but is easy and robust (we hope).
    if (gradingJobQueryResult.aai && !gradingJobQueryResult.aai.authorized) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }

    const grading_job = gradingJobQueryResult.grading_job;

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
