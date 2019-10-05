const winston = require('winston');
const S3StreamLogger = require('s3-streamlogger').S3StreamLogger;

const globalLogger = require('./logger');
const config = require('./config').config;

module.exports = function(options) {
    const {
        bucket,
        rootKey
    } = options;

    const s3LoggerStream = new S3StreamLogger({
        bucket,
        folder: rootKey,
        name_format: 'output.log', // No need to rotate, all logs go to same file
        upload_every: 1000 // Most jobs are short-lived, so push every 1s
    });

    const transports = [
        new (winston.transports.Stream)({
            stream: s3LoggerStream,
        })
    ];

    if (config.useConsoleLoggingForJobs) {
        transports.push(new winston.transports.Console({timestamp: true, colorize: true}));
    }

    const logger = winston.createLogger({ transports });

    logger.on('error', (err) => {
        globalLogger.error(`Error sending logs to ${bucket}/${rootKey}/output.log:`, err);
    });

    return logger;
};
