var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');

var config = require('../../lib/config');
var logger = require('../../lib/logger');
var assessment = require('../../lib/assessment');
var externalGraderCommon = require('../../lib/externalGraderCommon');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);
var externalGradingSocket = require('../../lib/external-grading-socket');

function processResults(jobId, data) {
    assessment.processGradingResult(externalGraderCommon.makeGradingResult(jobId, data));
}

router.post('/', function(req, res, next) {

    const data = req.body;
    if (data.event === 'grading_start') {
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
            start_time: data.data.start_time,
        };

        sqldb.queryOneRow(sql.update_grading_start_time, params, (err, _result) => {
            if (ERR(err, (err) => logger.error(err))) return;
            externalGradingSocket.gradingLogStatusUpdated(jobId);
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

        // It's possible that the results data was specified in the body;
        // if that's the case, we can process it directly. Otherwise, we
        // have to download it from S3 first.

        if (data.data) {
            // We have the data!
            processResults(jobId, data.data);

        } else {
            // We should fetch it from S3, and then process it
            const params = {
                Bucket: config.externalGradingResultsS3Bucket,
                Key: `job_${jobId}.json`,
                ResponseContentType: 'application/json',
            };
            new AWS.S3().getObject(params, (err, s3Data) => {
                if (ERR(err, (err) => logger.error(err))) return;
                processResults(jobId, s3Data.Body);
            });
        }

        res.status(200);
        res.send();
    } else {
        logger.error('Invalid grading event received:');
        logger.error(data);
        return next(new Error(`Unknown grading event: ${data.event}`));
    }
});

module.exports = router;
