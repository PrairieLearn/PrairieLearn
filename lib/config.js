var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var logger = require('./logger');
var jsonLoad = require('./json-load');

var config = module.exports;

// defaults - can be overridden in config.json
config.startServer = true;
config.dbAddress = 'mongodb://localhost:27017/data';
config.postgresqlUser = 'postgres';
config.postgresqlPassword = null;
config.postgresqlDatabase = 'postgres';
config.postgresqlHost = 'localhost';
config.amqpAddress = null;
config.amqpResultQueue = 'result';
config.amqpStartQueue = 'start';
config.logFilename = 'server.log';
config.authType = 'none';
config.serverType = 'http';
config.serverPort = '3000';
config.cronIntervalMS = 10 * 60 * 1000;
config.autoFinishAgeMins = 6 * 60;
config.questionDefaultsDir = "question-servers/default-calculation";
config.secretKey = "THIS_IS_THE_SECRET_KEY"; // override in config.json

config.loadConfig = function(file) {
    if (fs.existsSync(file)) {
        fileConfig = jsonLoad.readJSONSyncOrDie(file, 'schemas/serverConfig.json');
        _.assign(config, fileConfig);
    } else {
        logger.warn(file + " not found, using default configuration");
    }
};
