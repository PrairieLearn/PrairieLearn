const winston = require('winston');
const CloudWatchTransport = require('winston-aws-cloudwatch');

const globalLogger = require('./logger');
const config = require('./config');

module.exports = function(options) {
    const {
        groupName,
        streamName
    } = options;

    const transports = [
        new (CloudWatchTransport)({
            level: 'info',
            logGroupName: groupName,
            logStreamName: streamName,
            createLogGroup: true,
            createLogStream: true,
            submissionInterval: 1000,
            batchSize: 30,
            awsConfig: config.awsConfig
        })
    ];

    if (config.devMode) {
        globalLogger.info('Adding console logger to CloudWatch logger');
        transports.push(new (winston.transports.Console)({timestamp: true, colorize: true}));
    }

    const logger = new (winston.Logger)({ transports });

    logger.on('error', (err) => {
        globalLogger.error(`Error sending logs to ${streamName} in group ${groupName}`);
        globalLogger.error(err);
    });

    return logger;
};
