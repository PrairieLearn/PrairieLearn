var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({timestamp: true, colorize: true}),
    ],
});

logger.errorList = [];

var MemLogger = winston.transports.MemLogger = function(options) {
    this.name = 'memLogger';
    this.level = options.level || 'info';
};
MemLogger.prototype = new winston.Transport;
MemLogger.prototype.log = function(level, msg, meta, callback) {
    logger.errorList.push({timestamp: (new Date()).toISOString(), level: level, msg: msg, meta: meta});
    callback(null, true);
};
logger.add(winston.transports.MemLogger, {});

logger.addFileLogging = function(filename) {
    logger.add(winston.transports.File, {filename: filename, level: 'debug'});
};

logger.transports.console.level = 'info';
logger.transports.memLogger.level = 'warn';


module.exports = logger;
