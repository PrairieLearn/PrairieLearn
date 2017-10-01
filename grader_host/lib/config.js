const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const AWS = require('aws-sdk');
const request = require('request');

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
            if (config.devMode) {
                config.instanceId = 'dev';
                return callback(null);
            }
            if (process.env.INSTANCE_ID) {
                config.instanceId = process.env.INSTANCE_ID;
                return callback(null);
            }
            // assume we are running on AWS
            request('http://169.254.169.254/latest/meta-data/instance-id', function (err, response, body) {
                if (ERR(err, callback)) return;
                if (response.statusCode != 200) {
                    return callback(new Error('Bad status getting instance-id: ' + response.statusCode + '\n' + body));
                }
                match = /(i-[a-f0-9]+)/.exec(body);
                if (match == null) return callback(new Error('could not find instance-id in: ' + body));
                config.instanceId = match[0];
                callback(null);
            });
        },
        (callback) => {
            config.reportLoad = (process.env.REPORT_LOAD == 'true') ? true : false;
            config.reportIntervalSec = process.reportIntervalSec || 10;
            config.postgresqlHost = process.env.PG_HOST || 'localhost';
            config.postgresqlDatabase = process.env.PG_DATABASE || 'postgres';
            config.postgresqlUser = process.env.PG_USER || 'grader';
            config.postgresqlPassword = process.env.PG_PASSWORD || 'grader_password';
            callback(null);
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
