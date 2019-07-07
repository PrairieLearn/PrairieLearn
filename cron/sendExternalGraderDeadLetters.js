const ERR = require('async-stacktrace');
const async = require('async');
const AWS = require('aws-sdk');

const config = require('../lib/config');
const logger = require('../lib/logger');
const opsbot = require('../lib/opsbot');

// After loading the queue url for the first time, we'll cache it here
const QUEUE_URLS = {};

module.exports = {};

module.exports.run = (callback) => {
    if (!opsbot.canSendMessages()) return callback(null);
    if (!config.externalGradingUseAws) return callback(null);

    const sqs = new AWS.SQS();
    let msg;
    async.series([
        (callback) => {
            loadQueueUrl(sqs, config.externalGradingJobsDeadLetterQueueName, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            loadQueueUrl(sqs, config.externalGradingResultsDeadLetterQueueName, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            getDeadLetterMsg(sqs, config.externalGradingJobsDeadLetterQueueName, (err, msgDL) => {
                if (ERR(err, callback)) return;
                msg = msgDL;
                callback(null);
            });
        },
        (callback) => {
            getDeadLetterMsg(sqs, config.externalGradingResultsDeadLetterQueueName, (err, msgDL) => {
                if (ERR(err, callback)) return;
                msg += msgDL;
                callback(null);
            });
        },
        (callback) => {
            opsbot.sendMessage(msg, (err, res, body) => {
                if (ERR(err, callback)) return;
                if (res.statusCode != 200) {
                    logger.error('Error posting external grading dead letters to slack [status code ${res.statusCode}]', body);
                }
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

function loadQueueUrl(sqs, queueName, callback) {
    if (QUEUE_URLS[queueName] != null) {
        callback(null);
    } else {
        logger.verbose(`Dead letter queue ${queueName}: getting URL...`);
        const params = {
            QueueName: queueName,
        };
        sqs.getQueueUrl(params, (err, data) => {
            if (ERR(err, callback)) return;
            QUEUE_URLS[queueName] = data.QueueUrl;
            logger.verbose(`Dead letter queue ${queueName}: got URL ${QUEUE_URLS[queueName]}`);
            callback(null);
        });
    }
}

function getDeadLetterMsg(sqs, queueName, callback) {
    drainQueue(sqs, queueName, (err, messages) => {
        if (ERR(err, callback)) return;
        let msgDL = `_Dead letter queue, past 24 hours:_ *${queueName}:* count: ${messages.length}\n`;
        for (let message of messages) {
            msgDL += JSON.stringify(message) + '\n';
        }
        logger.verbose('cron:sendExternalGraderDeadLetters', {queue: queueName, count: messages.length, messages});
        callback(null, msgDL);
    });        
}

function drainQueue(sqs, queueName, callback) {
    const messages = [];
    async.doWhilst((callback) => {
        const params = {
            MaxNumberOfMessages: 10,
            QueueUrl: QUEUE_URLS[queueName],
            WaitTimeSeconds: 20,
        };
        sqs.receiveMessage(params, (err, data) => {
            if (ERR(err, callback)) return;
            if (!data.Messages) {
                return callback(null, false); // stop with message collection
            }
            async.each(data.Messages, (message, callback) => {
                let parsedMessage;
                let receiptHandle;
                try {
                    parsedMessage = JSON.parse(message.Body);
                    receiptHandle = message.ReceiptHandle;
                } catch (e) {
                    return callback(e);
                }
                messages.push(parsedMessage);
                const deleteParams = {
                    QueueUrl: QUEUE_URLS[queueName],
                    ReceiptHandle: receiptHandle,
                };
                sqs.deleteMessage(deleteParams, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null, true); // keep getting messages if we got some this time
            });
        });
    }, (keepGoing) => {
        return keepGoing;
    }, (err) => {
        if (ERR(err, callback)) return;
        callback(null, messages);
    });
}
