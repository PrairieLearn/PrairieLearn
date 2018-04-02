const ERR = require('async-stacktrace');
const express = require('express');
const async = require('async');
const router = express.Router();
const AWS = require('aws-sdk');

const logger = require('../../lib/logger');
const assessment = require('../../lib/assessment');
const externalGraderCommon = require('../../lib/externalGraderCommon');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const externalGradingSocket = require('../../lib/externalGradingSocket');

function processResults(jobId, data) {
    assessment.processGradingResult(externalGraderCommon.makeGradingResult(jobId, data));
}

router.post('/', function(req, res, next) {

    const data = req.body;
    if (data.event === 'job_received') {
        let jobId;
        try {
            jobId = Number.parseInt(data.job_id);
            if (Number.isNaN(jobId)) {
                throw new Error();
            }
        } catch (e) {
            return next(new Error('Grading result does not contain a valid grading job id.'));
        }

        const params = {
            grading_job_id: jobId,
            received_time: data.data.received_time,
        };

        sqldb.queryOneRow(sql.update_grading_received_time, params, (err, _result) => {
            if (ERR(err, (err) => logger.error(err))) return;
            externalGradingSocket.gradingJobStatusUpdated(jobId);
        });

        res.status(200);
        res.send();
    } else if (data.event === 'grading_result') {
        let jobId;
        try {
            jobId = Number.parseInt(data.job_id);
            if (Number.isNaN(jobId)) {
                throw new Error();
            }
        } catch (e) {
            return next(new Error('Grading result does not contain a valid grading job id.'));
        }

        // Always send 200 right away to allow the grading instance to die as
        // fast as possible
        res.status(200);
        res.send();

        let s3Bucket, s3RootKey;
        async.series([
            (callback) => {
                // Check if we've already received results for this job and
                // ignore them if we have
                const params = {
                    grading_job_id: jobId,
                };
                sqldb.queryOneRow(sql.get_job_details, params, (err, result) => {
                    if (err) {
                        return callback(new Error(`Job ${jobId} could not be found`));
                    }
                    if (result.rows[0].was_graded) {
                        return callback(new Error(`Job ${jobId} was already graded`));
                    }
                    s3Bucket = result.rows[0].s3_bucket;
                    s3RootKey = result.rows[0].s3_root_key;
                    return callback(null);
                });
            },
            (callback) => {
                // It's possible that the results data was specified in the body;
                // if that's the case, we can process it directly. Otherwise, we
                // have to download it from S3 first.
                if (data.data) {
                    // We have the data!
                    processResults(jobId, data.data);

                } else {
                    // We should fetch it from S3, and then process it
                    const params = {
                        Bucket: s3Bucket,
                        Key: `${s3RootKey}/results.json`,
                        ResponseContentType: 'application/json',
                    };
                    new AWS.S3().getObject(params, (err, s3Data) => {
                        if (ERR(err, (err) => logger.error(err))) return;
                        processResults(jobId, s3Data.Body);
                        callback(null);
                    });
                }
            },
        ], (err) => {
            if (ERR(err, (err) => logger.error(err))) return;
        });
    } else {
        logger.error('Invalid grading event received:');
        logger.error(data);
        return next(new Error(`Unknown grading event: ${data.event}`));
    }
});

module.exports = router;
