const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const AWS = require('aws-sdk');
const os = require('os');
const _ = require('lodash');
const { config: configLib } = require('@prairielearn/prairielib');

const logger = require('./logger');

const configDir = path.resolve(__dirname, '..', 'config');

const config = module.exports;
const exportedConfig = config.config = {};

config.loadConfig = function(callback) {
    // Determine what environment we're running in
    const env = exportedConfig.env = process.env.NODE_ENV || 'development';
    exportedConfig.isProduction = exportedConfig.env == 'production';
    exportedConfig.isDevelopment = exportedConfig.env == 'development';

    async.series([
        (callback) => {
            configLib.loadConfigForEnvironment(configDir, env, (err, loadedConfig) => {
                if (ERR(err, callback)) return;
                _.assign(exportedConfig, loadedConfig);
                callback(null);
            });
        },
        (callback) => {
            // Try to grab AWS config from a file; assume Metadata Service will
            // provide credentials if the file is missing
            fs.readFile('./aws-config.json', (err, awsConfig) => {
                if (err) {
                    logger.info('Missing aws-config.json; credentials should be supplied by EC2 Metadata Service');
                    AWS.config.update({'region': 'us-east-2'});
                } else {
                    logger.info('Loading AWS config from aws-config.json');
                    AWS.config.loadFromPath('./aws-config.json');
                    exportedConfig.awsConfig = JSON.parse(awsConfig);
                }
                callback(null);
            });
        },
        (callback) => {
            const MetadataService = new AWS.MetadataService();
            MetadataService.request('instance-id', (err, instanceId) => {
                if (!err) {
                    exportedConfig.runningInEc2 = true;
                    exportedConfig.instanceId = instanceId;
                } else {
                    exportedConfig.runningInEc2 = false;
                    if (process.env.INSTANCE_ID) {
                        exportedConfig.instanceId = process.env.INSTANCE_ID;
                    } else {
                        exportedConfig.instanceId = os.hostname();
                    }
                }
                callback(null);
            });
        },
        (callback) => {
            // Initialize CloudWatch logging if it's enabled
            if (exportedConfig.useCloudWatchLogging) {
                const groupName = exportedConfig.globalLogGroup;
                const streamName = exportedConfig.instanceId;
                logger.initCloudWatchLogging(groupName, streamName);
                logger.info(`CloudWatch logging enabled! Logging to ${groupName}/${streamName}`);
            }
            callback(null);
        },
        (callback) => {
            getQueueUrl('jobs', callback);
        },
        (callback) => {
            getQueueUrl('results', callback);
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

/**
 * Will attempt to load the key [prefix]QueueUrl from config; if that's not
 * present, will use [prefix]QueueName to look up the queue URL with AWS.
 */
function getQueueUrl(prefix, callback) {
    const queueUrlKey = `${prefix}QueueUrl`;
    const queueNameKey = `${prefix}QueueName`;
    if (exportedConfig[queueUrlKey]) {
        logger.info(`Using queue url from config: ${exportedConfig[queueUrlKey]}`);
        callback(null);
    } else {
        logger.info(`Loading url for queue "${exportedConfig[queueNameKey]}"`);
        const sqs = new AWS.SQS();
        const params = {
            QueueName: exportedConfig[queueNameKey],
        };
        sqs.getQueueUrl(params, (err, data) => {
            if (err) {
                logger.error(`Unable to load url for queue "${exportedConfig[queueNameKey]}"`);
                logger.error(err);
                process.exit(1);
            }
            exportedConfig[queueUrlKey] = data.QueueUrl;
            logger.info(`Loaded url for queue "${exportedConfig[queueNameKey]}": ${exportedConfig[queueUrlKey]}`);
            callback(null);
        });
    }
}
