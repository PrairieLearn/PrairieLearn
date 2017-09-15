var _ = require('lodash');
var fs = require('fs');
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
config.questionDefaultsDir = 'question-servers/default-calculation';
config.secretKey = 'THIS_IS_THE_SECRET_KEY'; // override in config.json
config.secretSlackOpsBotEndpoint = null; // override in config.json
config.externalGradingUseAws = false;
config.externalGradingUseBatch = false;
config.externalGradingSqsQueueName = 'grading';
config.externalGradingJobsS3Bucket = 'prairielearn.dev.grading.jobs';
config.externalGradingResultsS3Bucket = 'prairielearn.dev.grading.results';
config.externalGradingArchivesS3Bucket = 'prairielearn.dev.grading.archives';
config.externalGradingECSCluster = 'grading';
config.externalGradingJobQueue = 'grading-job-queue-dev';
config.externalGradingJobRole = 'arn:aws:iam::078374015580:role/GradingContainer';
config.externalGradingWebhookUrl = null;

config.loadConfig = function(file) {
    if (fs.existsSync(file)) {
        let fileConfig = jsonLoad.readJSONSyncOrDie(file, 'schemas/serverConfig.json');
        _.assign(config, fileConfig);
    } else {
        logger.warn(file + ' not found, using default configuration');
    }
};
