// @ts-check
const winston = require('winston');
import { format } from 'logform';

const consoleTransport = new winston.transports.Console({
  level: 'info',
  silent: process.env.NODE_ENV === 'test',
  format: format.combine(format.colorize(), format.simple()),
});

const logger = winston.createLogger({
  transports: [consoleTransport],
});

export default logger;
