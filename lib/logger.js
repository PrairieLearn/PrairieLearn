const winston = require('winston');
const { format } = require('logform');
const CloudWatchTransport = require('winston-aws-cloudwatch');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            name: 'console',
            level: 'info',
            format: format.combine(
                format.colorize(),
                format.simple(),
            ),
        }),
    ],
});

logger.addFileLogging = function(filename) {
    logger.add(new winston.transports.File({
        name: 'file',
        filename: filename,
        level: 'debug',
        format: format.combine(
            format.timestamp(),
            format.json(),
        ),
    }));
};

logger.initCloudWatchLogging = function(groupName, streamName) {
    logger.add(new CloudWatchTransport({
        level: 'info',
        logGroupName: groupName,
        logStreamName: streamName,
        createLogGroup: true,
        createLogStream: true,
        submissionInterval: 500,
        batchSize: 100,
    }));
};

module.exports = logger;
