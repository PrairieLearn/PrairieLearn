var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var logger = require('./logger');
var jsonLoad = require('./json-load');

var config = module.exports;

// defaults - can be overridden in config.json
config.timezone = 'America/Chicago';
config.dbAddress = 'mongodb://localhost:27017/data';
config.sdbAddress = 'postgres://localhost/database';
config.logFilename = 'server.log';
config.authType = 'none';
config.localFileserver = true;
config.serverType = 'http';
config.serverPort = '3000';
config.courseDir = "../exampleCourse";
config.frontendDir = "../frontend";
config.questionDefaultsDir = "questionDefaults";
config.polyfillGitShow = false;
config.secretKey = "THIS_IS_THE_SECRET_KEY"; // override in config.json
config.skipUIDs = {};
config.superusers = {};
config.roles = {"user1@illinois.edu": "Superuser"};

config.computeRelativePaths = function() {
    config.questionsDir = path.join(config.courseDir, "questions");
    config.clientCodeDir = path.join(config.courseDir, "clientCode");
    config.serverCodeDir = path.join(config.courseDir, "serverCode");
    config.clientFilesDir = path.join(config.courseDir, "clientFiles");

    config.requireDir = path.join(config.frontendDir, "require");
    config.relativeClientCodeDir = path.relative(path.resolve(config.requireDir), path.resolve(config.clientCodeDir));
    config.relativeServerCodeDir = path.relative(path.resolve(config.requireDir), path.resolve(config.serverCodeDir));
};

// compute default paths, can be overridden later by loadConfig()
config.computeRelativePaths();

config.loadConfig = function(file) {
    if (fs.existsSync(file)) {
        fileConfig = jsonLoad.readJSONSyncOrDie(file, 'schemas/backendConfig.json');
        _.extend(config, fileConfig);
    } else {
        logger.warn(file + " not found, using default configuration");
    }

    config.computeRelativePaths();

    _(config.superusers).forEach(function(value, key) {
        if (value) {
            config.roles[key] = "Superuser";
        } else {
            config.roles[key] = "Student";
        }
    });
};
