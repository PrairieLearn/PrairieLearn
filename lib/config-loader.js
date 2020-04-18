const _ = require('lodash');
const fs = require('fs');
const logger = require('./logger');
const jsonLoad = require('./json-load');
const schemas = require('../schemas');

module.exports = {};

module.exports.load = function(config, file) {
    if (fs.existsSync(file)) {
        const fileConfig = jsonLoad.readJSONSyncOrDie(file, schemas.serverConfig);
        _.assign(config, fileConfig);
    } else {
        logger.warn(file + ' not found, using default configuration');
    }
};

module.exports.setLocals = (config, locals) => {
    locals.homeUrl = config.homeUrl;
    locals.urlPrefix = config.urlPrefix;
    locals.plainUrlPrefix = config.urlPrefix;
    locals.navbarType = 'plain';
    locals.devMode = config.devMode;
    locals.is_administrator = false;
};
