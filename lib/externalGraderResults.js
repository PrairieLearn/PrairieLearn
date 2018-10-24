const ERR = require('async-stacktrace');
const async = require('async');
const { sqldb, sqlLoader } = require('@prairielearn/prairielib');
const error = require('@prairielearn/prairielib/error');
const AWS = require('aws-sdk');

const config = require('./config');
const sql = sqlLoader.loadSqlEquiv(__filename);
const externalGradingSocket = require('./externalGradingSocket');
const assessment = require('./assessment');
const externalGraderCommon = require('./externalGraderCommon');
const logger = require('./logger');

// After loading the queue url for the first time, we'll cache it here
let QUEUE_URL = null;

module.exports.init = function(callback) {
    // If we're not configured to use AWS, don't try to do anything here
    if (!config.externalGradingUseAws) {
        return callback(null);
    }

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
                            WaitTimeSeconds: 20,
                        };
                        sqs.receiveMessage(params, (err, data) => {
                            if (ERR(err, done)) return;
                            if (!data.Messages) {
                                return done(null, null);
                            }
                            done(null, data.Messages);
                        });
                    }, (messages) => {
                        return !!messages;
                    }, (err, messages) => {
                        if (ERR(err, callback)) return;
                        callback(null, messages);
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
                            // We're just going to black-hole errors here
                            if (ERR(err, (err) => logger.error(err)));

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
        logger.verbose(`External grading results queue ${config.externalGradingResultsQueueName}: getting URL...`);
        const params = {
            QueueName: config.externalGradingResultsQueueName,
        };
        sqs.getQueueUrl(params, (err, data) => {
            if (ERR(err, callback)) return;
            QUEUE_URL = data.QueueUrl;
            logger.verbose(`External grading results queue ${config.externalGradingResultsQueueName}: got URL ${QUEUE_URL}`);
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
        return callback(error.makeWithData('Message does not contain a valid grading job id.', data));
    }

    logger.verbose('Processing external grading job result message', {grading_job_id: jobId, ...data});
    if (data.event === 'job_received') {
        const params = {
            grading_job_id: jobId,
            received_time: data.data.receivedTime,
        };
        sqldb.queryOneRow(sql.update_grading_received_time, params, (err, _result) => {
            if (ERR(err, callback)) return;
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
                        return callback(error.makeWithData(`Job ${jobId} could not be found`, data));
                    }
                    if (result.rows[0].was_graded) {
                        return callback(error.makeWithData(`Job ${jobId} was already graded`, data));
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
                    callback(null);

                } else {
                    // We should fetch it from S3, and then process it
                    const params = {
                        Bucket: s3Bucket,
                        Key: `${s3RootKey}/results.json`,
                        ResponseContentType: 'application/json',
                    };
                    new AWS.S3().getObject(params, (err, s3Data) => {
                        if (ERR(err, callback)) return;
                        processResults(jobId, s3Data.Body);
                        callback(null);
                    });
                }
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    } else {
        logger.error('Invalid grading event received:');
        logger.error(data);
        return callback(error.makeWithData(`Unknown grading event: ${data.event}`, data));
    }
}

function processResults(jobId, data) {
    assessment.processGradingResult(externalGraderCommon.makeGradingResult(jobId, data));
}
