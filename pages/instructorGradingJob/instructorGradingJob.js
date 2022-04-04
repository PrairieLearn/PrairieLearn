const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

const config = require('../../lib/config');
const error = require('../../prairielib/error');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

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

    _.assign(res.locals, result.rows[0]);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
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
    new AWS.S3(config.awsServiceGlobalOptions)
      .getObject(params)
      .createReadStream()
      .on('error', (err) => {
        return ERR(err, next);
      })
      .pipe(res);
  });
});

module.exports = router;
