const winston = require('winston');
const { format } = require('logform');
const CloudWatchTransport = require('winston-aws-cloudwatch');

const consoleTransport = new winston.transports.Console({
  name: 'console',
  level: 'info',
  silent: process.env.NODE_ENV === 'test',
  format: format.combine(format.colorize(), format.simple()),
});

const logger = winston.createLogger({
  transports: [consoleTransport],
});

logger.initCloudWatchLogging = function (groupName, streamName) {
  // IMPORTANT: don't require('./config') until after module is initialized
  // in order to prevent a circular dependency issue
  const { config } = require('./config');

  logger.add(
    new CloudWatchTransport({
      level: 'info',
      logGroupName: groupName,
      logStreamName: streamName,
      createLogGroup: true,
      createLogStream: true,
      submissionInterval: 500,
      batchSize: 100,
      awsConfig: config.awsConfig,
    })
  );
};

module.exports = logger;
