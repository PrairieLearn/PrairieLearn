const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

const logger = require('../../lib/logger');
const sqldb = require('../../lib/sqldb');
const sqlLoader = require('../../lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:job_id', (req, res, next) => {
    const params = {
        job_id: req.params.job_id,
        course_instance_id: res.locals.course_instance.id,
    };
    sqldb.queryOneRow(sql.select_job, params, (err, result) => {
        if (ERR(err, next)) return;

        _.assign(res.locals, result.rows[0]);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

const allowedFiles = [
    'job.tar.gz',
    'archive.tar.gz',
    'output.log',
    'results.json'
];

router.get('/:job_id/:file', (req, res, next) => {
    const file = req.params.file;
    if (allowedFiles.indexOf(file) == -1) {
        return next(new Error(`Unknown file ${file}`));
    }

    const params = {
        job_id: req.params.job_id,
        course_instance_id: res.locals.course_instance.id,
    };
    sqldb.queryOneRow(sql.select_job, params, (err, result) => {
        if (ERR(err, next)) return;

        const grading_job = result.rows[0].grading_job;
        if (!grading_job.s3_bucket || !grading_job.s3_root_key) {
            return next(new Error(`Job ${grading_job.id} does not have any files stored in S3.`));
        }

        const params = {
            Bucket: grading_job.s3_bucket,
            Key: `${grading_job.s3_root_key}/${file}`,
        };
        logger.info(params);
        res.attachment(file);
        new AWS.S3().getObject(params).createReadStream()
        .on('error', (err) => {
            return ERR(err, next);
        }).pipe(res);
    });
});

module.exports = router;
