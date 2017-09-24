const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const AWS = require('aws-sdk');
const Ajv = require('ajv');

const cloudWatchLogger = require('./cloudWatchLogger');
const globalLogger = require('./logger');

let messageSchema = null;

module.exports = function(queueUrl, receiveCallback) {
    const sqs = new AWS.SQS();
    async.forever((next) => {
        let parsedMessage, receiptHandle, logger;
        async.series([
            (callback) => {
                globalLogger.info('Waiting for next job');
                async.doUntil((done) => {
                    const params = {
                        MaxNumberOfMessages: 1,
                        QueueUrl: queueUrl,
                        WaitTimeSeconds: 20
                    };
                    sqs.receiveMessage(params, (err, data) => {
                        if (ERR(err, done)) return;
                        if (!data.Messages) {
                            return done(null, null);
                        }
                        globalLogger.info('Received job!');
                        try {
                            parsedMessage = JSON.parse(data.Messages[0].Body);
                            receiptHandle = data.Messages[0].ReceiptHandle;
                            return done(null, parsedMessage);
                        } catch (e) {
                            return done(e);
                        }
                    });
                }, (result) => {
                    return !!result;
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                if (!messageSchema) {
                    fs.readJson(path.join(__dirname, 'messageSchema.json'), (err, data) => {
                        if (ERR(err, (err) => globalLogger.error(err))) {
                            globalLogger.error('Failed to read message schema; exiting process');
                            process.exit(1);
                        }
                        const ajv = new Ajv();
                        messageSchema = ajv.compile(data);
                        return callback(null);
                    });
                } else {
                    return callback (null);
                }
            },
            (callback) => {
                const valid = messageSchema(parsedMessage);
                if (!valid) {
                    globalLogger.error(messageSchema.errors);
                    return callback(new Error('Message did not match schema.'));
                } else {
                    return callback(null);
                }
            },
            (callback) => {
                const timestamp = new Date().getTime();
                const loggerOptions = {
                    groupName: process.env.LOG_GROUP || 'grading_debug',
                    streamName: `job_${parsedMessage.jobId}_${timestamp}`
                };
                logger = cloudWatchLogger(loggerOptions);
                callback(null);
            },
            (callback) => {
                receiveCallback(parsedMessage, logger, (err) => {
                    callback(err);
                }, () => {
                    callback(null);
                });
            },
            (callback) => {
                const deleteParams = {
                    QueueUrl: queueUrl,
                    ReceiptHandle: receiptHandle
                };
                sqs.deleteMessage(deleteParams, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null);
                });
            }
        ], (err) => {
            if (ERR(err, (err) => logger.error(err)));
            next();
        });
    });
};
