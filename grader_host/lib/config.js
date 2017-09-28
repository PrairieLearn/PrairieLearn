const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const AWS = require('aws-sdk');

const logger = require('./logger');

const config = module.exports;

config.loadConfig = function(callback) {
    async.series([
        (callback) => {
            fs.readFile('./aws-config.json', (err, awsConfig) => {
                if (err) {
                    logger.log('Missing aws-config.json; this shouldn\'t matter when running in production');
                    config.devMode = false;
                    AWS.config.update({'region': 'us-east-2'});
                } else {
                    logger.log('Loading AWS config from aws-config.json');
                    config.devMode = true;
                    AWS.config.loadFromPath('./aws-config.json');
                    config.awsConfig = awsConfig;
                }
                callback(null);
            });
        },
        (callback) => {
            config.queueName = process.env.QUEUE_NAME || 'grading';
            if (process.env.QUEUE_URL) {
                logger.info(`Using queue url from QUEUE_URL environment variable: ${process.env.QUEUE_URL}`);
                config.queueUrl = process.env.QUEUE_URL;
                callback(null);
            } else {
                logger.info(`Loading url for queue "${config.queueName}"`);
                const sqs = new AWS.SQS();
                const params = {
                    QueueName: config.queueName
                };
                sqs.getQueueUrl(params, (err, data) => {
                    if (err) {
                        logger.error(`Unable to load url for queue "${config.queueName}"`);
                        logger.error(err);
                        process.exit(1);
                    }
                    config.queueUrl = data.QueueUrl;
                    logger.info(`Loaded url for queue "${config.queueName}": ${config.queueUrl}`);
                    callback(null);
                });
            }
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
