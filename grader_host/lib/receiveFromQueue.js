const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const Ajv = require('ajv');

const globalLogger = require('./logger');
const config = require('./config').config;

let messageSchema = null;

module.exports = function(sqs, queueUrl, receiveCallback, doneCallback) {
    let parsedMessage, receiptHandle;
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
                    } catch (e) {
                        return done(e);
                    }
                    return done(null, parsedMessage);
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
            const timeout = parsedMessage.timeout || config.defaultTimeout;
            const visibilityParams = {
                QueueUrl: queueUrl,
                ReceiptHandle: receiptHandle,
                VisibilityTimeout: timeout + 10,
            };
            sqs.changeMessageVisibility(visibilityParams, (err) => {
                if (ERR(err, callback)) return;
                return callback(null);
            });
        },
        (callback) => {
            receiveCallback(parsedMessage, (err) => {
                globalLogger.error('err!');
                callback(err);
            }, () => {
                globalLogger.info('success!');
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
        globalLogger.info('done!');
        if (ERR(err, doneCallback)) return;
        doneCallback(null);
    });
};
