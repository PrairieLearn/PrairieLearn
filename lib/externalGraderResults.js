const ERR = require('async-stacktrace');
const async = require('async');
const { sqldb, sqlLoader } = require('@prairielearn/prairielib');
const AWS = require('aws-sdk');

const config = require('./config').config;
const sql = sqlLoader.loadSqlEquiv(__filename);
const externalGradingSocket = require('../../lib/externalGradingSocket');
const assessment = require('../../lib/assessment');
const externalGraderCommon = require('../../lib/externalGraderCommon');
const logger = require('./logger');

// After loading the queue url for the first time, we'll cache it here
let QUEUE_URL = null;

module.export = function(callback) {
    const sqs = new AWS.SQS();
    loadQueueUrl(sqs, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
        async.forever((next) => {
            async.waterfall([
                (callback) => {
                    async.doUntil((done) => {
                        const params = {
                            MaxNumberOfMessages: 10,
                            QueueUrl: QUEUE_URL,
                            WaitTimeSeconds: 30,
                        };
                        sqs.receiveMessage(params, (err, data) => {
                            if (ERR(err, done)) return;
                            if (!data.Messages) {
                                return done(null, null);
                            }
                            callback(null, data.Messages);
                        });
                    });
                },
                (messages, callback) => {
                    async.each(messages, (message, callback) => {
                        let parsedMessage;
                        let receiptHandle;
                        try {
                            parsedMessage = JSON.parse(message.Body);
                            receiptHandle = message.ReceiptHandle;
                        } catch (e) {
                            return callback(e);
                        }

                        processMessage(parsedMessage, (err) => {
                            if (ERR(err, callback)) return;
                            const deleteParams = {
                                QueueUrl: QUEUE_URL,
                                ReceiptHandle: receiptHandle,
                            };
                            sqs.deleteMessage(deleteParams, (err) => {
                                if (ERR(err, callback)) return;
                                return callback(null);
                            });
                        });
                    }, (err) => {
                        if (ERR(err, callback)) return;
                        return callback(null);
                    });
                },
            ], (err) => {
                if (ERR(err, (err) => logger.error(err)));
                next();
            });
        });
    });
};

function loadQueueUrl(sqs, callback) {
    if (QUEUE_URL !== null) {
        callback(null);
    } else {
        const params = {
            QueueName: config.externalGradingResultsQueueName,
        };
        sqs.getQueueUrl(params, (err, data) => {
            if (ERR(err, callback)) return;
            QUEUE_URL = data.QueueUrl;
            callback(null);
        });
    }
}

function processMessage(data, callback) {
    let jobId;
    try {
        jobId = Number.parseInt(data.jobId);
        if (Number.isNaN(jobId)) {
            throw new Error();
        }
    } catch (e) {
        return callback(new Error('Message does not contain a valid grading job id.'));
    }

    if (data.event === 'job_received') {
        const params = {
            grading_job_id: jobId,
            received_time: data.data.received_time,
        };

        sqldb.queryOneRow(sql.update_grading_received_time, params, (err, _result) => {
            if (ERR(err, (err) => logger.error(err))) return;
            externalGradingSocket.gradingJobStatusUpdated(jobId);
            callback(null);
        });
    } else if (data.event === 'grading_result') {
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
        return callback(new Error(`Unknown grading event: ${data.event}`));
    }
}

function processResults(jobId, data) {
    assessment.processGradingResult(externalGraderCommon.makeGradingResult(jobId, data));
}
