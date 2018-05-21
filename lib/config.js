const ERR = require('async-stacktrace');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const jsonLoad = require('./json-load');
const { config: configLib } = require('@prairielearn/prairielib');

const config = module.exports;

function customAssign(objValue) {
    if (objValue !== undefined) {
        return objValue;
    }
    // Default handling
    return undefined;
}

config.loadConfig = function(file, callback) {
    const configDir = path.resolve(__dirname, '..', 'config');
    configLib.loadConfig(configDir, null, (err, loadedConfig) => {
        if (ERR(err, callback)) return;

        // Validate config from environment variables + defaults
        jsonLoad.validateJSONWithSchema(loadedConfig, 'schemas/serverConfig.json', (err) => {
            if (ERR(err, callback)) return;

            let fileConfig = {};
            if (fs.existsSync(file)) {
                fileConfig = jsonLoad.readJSONSyncOrDie(file, 'schemas/serverConfig.json');
            } else {
                logger.warn(file + ' not found, using default configuration');
            }
            _.assignWith(config, fileConfig, loadedConfig, customAssign);
            callback(null);
        });
    });
};
