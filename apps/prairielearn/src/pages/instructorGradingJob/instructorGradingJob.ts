import ERR = require('async-stacktrace');
// import _ = require('lodash');
import express = require('express');
import { pipeline } from 'node:stream/promises';
import { S3, NoSuchKey } from '@aws-sdk/client-s3';
import error = require('@prairielearn/error');
import sqldb = require('@prairielearn/postgres');
import type { Readable } from 'stream';

import aws = require('../../lib/aws');
import { instructorGradingJob } from './instructorGradingJob.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

// NOTE: We assume that instructorGradingJob is only mounted on the course_instance
// page route, as is currently the case. If you add a course page route, take care!
// See instructorJobSequence, for example.

router.get('/:job_id', (req, res, next) => {
  const params = {
    job_id: req.params.job_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  };
  sqldb.queryOneRow(sql.select_job, params, (err, result) => {
    if (ERR(err, next)) return;

    // If the grading job is associated with an assessment instance (through a
    // submission, a variant, and an instance question), then we need to check
    // if the effective user is authorized to view this assessment instance.
    //
    // The way we implement this check right now with authz_assessment_instance
    // is overkill, yes, but is easy and robust (we hope).
    if (result.rows[0].aai && !result.rows[0].aai.authorized) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }
    console.log(result.rows[0]);
    res.send(instructorGradingJob({ resLocals: res.locals, result: result.rows[0] }));
  });
});

const allowedFilesViewer = ['job.tar.gz', 'archive.tar.gz', 'output.log', 'results.json'];
const allowedFilesPreviewer = ['output.log', 'results.json'];

router.get('/:job_id/file/:file', (req, res, next) => {
  const file = req.params.file;
  const allowList = res.locals.authz_data.has_course_permission_view
    ? allowedFilesViewer
    : allowedFilesPreviewer;

  if (allowList.indexOf(file) === -1) {
    return next(new Error(`Unknown file ${file}`));
  }

  const params = {
    job_id: req.params.job_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  };
  sqldb.queryOneRow(sql.select_job, params, (err, result) => {
    if (ERR(err, next)) return;

    // If the grading job is associated with an assessment instance (through a
    // submission, a variant, and an instance question), then we need to check
    // if the effective user is authorized to view this assessment instance.
    //
    // The way we implement this check right now with authz_assessment_instance
    // is overkill, yes, but is easy and robust (we hope).
    if (result.rows[0].aai && !result.rows[0].aai.authorized) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }

    const grading_job = result.rows[0].grading_job;
    if (!grading_job.s3_bucket || !grading_job.s3_root_key) {
      return next(new Error(`Job ${grading_job.id} does not have any files stored in S3.`));
    }

    const params = {
      Bucket: grading_job.s3_bucket,
      Key: `${grading_job.s3_root_key}/${file}`,
    };
    res.attachment(file);

    const s3 = new S3(aws.makeS3ClientConfig());
    s3.getObject(params)
      .then((object) => {
        console.log(object);
        return pipeline(object.Body<Readable>, res);
      })
      .catch((err) => {
        if (err instanceof NoSuchKey) {
          res.status(404).send();
        } else {
          ERR(err, next);
        }
      });
  });
});

export default router;
