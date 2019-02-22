const winston = require('winston');
const { format } = require('logform');

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

module.exports = logger;
