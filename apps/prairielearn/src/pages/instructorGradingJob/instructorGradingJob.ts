import ERR from 'async-stacktrace';
import * as express from 'express';
import { pipeline } from 'node:stream/promises';
import { S3, NoSuchKey } from '@aws-sdk/client-s3';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import asyncHandler from 'express-async-handler';
import stream from 'stream';

import aws from '../../lib/aws';
import { instructorGradingJob, GradingJobQueryResultSchema } from './instructorGradingJob.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/:job_id',
  asyncHandler(async (req, res, next) => {
    const params = {
      job_id: req.params.job_id,
      course_instance_id: res.locals.course_instance?.id ?? null,
      course_id: res.locals.course.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    };
    const gradingJobQuery = await sqldb.queryZeroOrOneRowAsync(sql.select_job, params);
    if (gradingJobQuery.rows.length === 0) {
      return next(error.make(404, 'Job not found'));
    }
    const gradingJobQueryResult = GradingJobQueryResultSchema.parse(gradingJobQuery.rows[0]);
    // If the grading job is associated with an assessment instance (through a
    // submission, a variant, and an instance question), then we need to check
    // if the effective user is authorized to view this assessment instance.
    //
    // The way we implement this check right now with authz_assessment_instance
    // is overkill, yes, but is easy and robust (we hope).
    if (gradingJobQueryResult.aai && !gradingJobQueryResult.aai.authorized) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }
    res.send(instructorGradingJob({ resLocals: res.locals, gradingJobQueryResult }));
  }),
);

const allowedFilesViewer = ['job.tar.gz', 'archive.tar.gz', 'output.log', 'results.json'];
const allowedFilesPreviewer = ['output.log', 'results.json'];

router.get(
  '/:job_id/file/:file',
  asyncHandler(async (req, res, next) => {
    const file = req.params.file;
    const allowList = res.locals.authz_data.has_course_permission_view
      ? allowedFilesViewer
      : allowedFilesPreviewer;

    if (allowList.indexOf(file) === -1) {
      return next(new Error(`Unknown file ${file}`));
    }

    const params = {
      job_id: req.params.job_id,
      course_instance_id: res.locals.course_instance?.id ?? null,
      course_id: res.locals.course.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    };
    const gradingJobQuery = await sqldb.queryZeroOrOneRowAsync(sql.select_job, params);
    if (gradingJobQuery.rows.length === 0) {
      return next(error.make(404, 'Job not found'));
    }
    const gradingJobQueryResult = GradingJobQueryResultSchema.parse(gradingJobQuery.rows[0]);
    // If the grading job is associated with an assessment instance (through a
    // submission, a variant, and an instance question), then we need to check
    // if the effective user is authorized to view this assessment instance.
    //
    // The way we implement this check right now with authz_assessment_instance
    // is overkill, yes, but is easy and robust (we hope).
    if (gradingJobQueryResult.aai && !gradingJobQueryResult.aai.authorized) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }

    const grading_job = gradingJobQueryResult.grading_job;
    if (!grading_job.s3_bucket || !grading_job.s3_root_key) {
      return next(new Error(`Job ${grading_job.id} does not have any files stored in S3.`));
    }

    const s3Params = {
      Bucket: grading_job.s3_bucket,
      Key: `${grading_job.s3_root_key}/${file}`,
    };
    res.attachment(file);

    const s3 = new S3(aws.makeS3ClientConfig());
    s3.getObject(s3Params)
      .then((object) => {
        if (object.Body === undefined) {
          throw new Error(
            `S3 object ${grading_job.s3_bucket}/${grading_job.s3_root_key}/${file} has no body.`,
          );
        }
        return pipeline(object.Body as stream.Readable, res);
      })
      .catch((err) => {
        if (err instanceof NoSuchKey) {
          res.status(404).send();
        } else {
          ERR(err, next);
        }
      });
  }),
);

export default router;
