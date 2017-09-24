const winston = require('winston');
const logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({timestamp: true, colorize: true})
    ]
});

logger.transports.console.level = 'info';

module.exports = logger;
