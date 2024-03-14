const winston = require('winston');
const { format } = require('logform');

const consoleTransport = new winston.transports.Console({
  name: 'console',
  level: 'info',
  silent: process.env.NODE_ENV === 'test',
  format: format.combine(format.colorize(), format.simple()),
});

const logger = winston.createLogger({
  transports: [consoleTransport],
});

module.exports = logger;
