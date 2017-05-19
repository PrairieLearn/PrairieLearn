var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');

var config = require('../../lib/config');
var logger = require('../../lib/logger');
var filePaths = require('../../lib/file-paths');
var assessments = require('../../assessments');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);
var externalGradingSocket = require('../../lib/external-grading-socket');

// FIXME move this to assessments.js for better code reuse; pull the nice
// error-handling logic from messageQueue.js into this function as well
function processResults(data) {
    const gradingResult = {
        gradingId: data.job_id,
        grading: {
            startTime: data.start_time || null,
            endTime: data.end_time || null,
            score: data.results.score,
            feedback: data
        }
    }

    assessments.processGradingResult(gradingResult);
}

router.post('/', function(req, res, next) {

    const data = req.body;
    if (data.event === 'grading_start') {
        if (!Number.isInteger(data.job_id)) {
            return next(new Error('Grading start event does not contain a valid grading job id.'));
        }

        const params = {
            grading_job_id: data.job_id,
            start_time: data.data.start_time,
        };

        sqldb.queryOneRow(sql.update_grading_start_time, params, (err, result) => {
            if (ERR(err, (err) => logger.error(err))) return;
            externalGradingSocket.gradingLogStatusUpdated(data.job_id);
        });

        res.status(200);
        res.send();
    } else if (data.event === 'grading_result') {
        if (data.job_id === undefined || data.job_id === null || !Number.isInteger(data.job_id)) {
            return next(new Error('Grading result does not contain a valid grading job id.'));
        }

        // It's possible that the results data was specified in the body;
        // if that's the case, we can process it directly. Otherwise, we
        // have to download it from S3 first.

        if (data.data) {
            // We have the data!
            processResults(data.data)

        } else {
            // We should fetch it from S3, and then process it
            const params = {
                Bucket: config.externalGradingResultsS3Bucket,
                Key: `job_${data.job_id}.json`,
                ResponseContentType: 'application/json',
            }
            new AWS.S3().getObject(params, (err, data) => {
                if (ERR(err, (err) => logger.error(err))) return;
                processResults(JSON.parse(data.Body))
            });
        }

        res.status(200);
        res.send();
    } else {
        return next(new Error('Unknown event'));
    }
});

module.exports = router;
