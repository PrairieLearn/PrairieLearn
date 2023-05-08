const winston = require('winston');
const S3StreamLogger = require('s3-streamlogger').S3StreamLogger;

const globalLogger = require('./logger');
const { config } = require('./config');

module.exports = function (options) {
  const { bucket, rootKey } = options;

  const s3StreamLoggerTransport = new winston.transports.Stream({
    stream: new S3StreamLogger({
      bucket,
      folder: rootKey,
      name_format: 'output.log', // No need to rotate, all logs go to same file
      upload_every: 1000, // Most jobs are short-lived, so push every second
      buffer_size: 100 * 1000, // 100kB - this is increased from the default 10kB
    }),
  });

  s3StreamLoggerTransport.on('error', (err) => {
    globalLogger.error(`Error writing to S3`, err);
  });

  const transports = [s3StreamLoggerTransport];

  if (config.useConsoleLoggingForJobs) {
    transports.push(new winston.transports.Console({ timestamp: true, colorize: true }));
  }

  const logger = winston.createLogger({ transports });

  logger.on('error', (err) => {
    globalLogger.error(`Error sending logs to ${bucket}/${rootKey}/output.log:`, err);
  });

  return logger;
};
