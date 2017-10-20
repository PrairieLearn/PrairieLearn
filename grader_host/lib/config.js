const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const AWS = require('aws-sdk');
const os = require('os');
const yaml = require('js-yaml');
const _ = require('lodash');

const logger = require('./logger');

/**
 * Class to load and expose configuration variables. Config is exposed via the
 * `config` object on this modules' exports.
 */

const config = module.exports;
const exportedConfig = config.config = {};

let configDir = path.resolve(__dirname, '..', 'config');

/**
 * Sets the absolute path to a directory to load config files from.
 */
config.setConfigDir = function(dir) {
    configDir = dir;
};

/**
 * Resets the configuration directory to the default (../config/)
 * @return {[type]} [description]
 */
config.resetConfigDir = function() {
    configDir = path.resolve(__dirname, '..', 'config');
};

/**
 * Clears any config items that were previously loaded.
 */
config.clearConfig = function() {
    Object.keys(exportedConfig).forEach(key => delete exportedConfig[key]);
};

/**
 * Recursively loads config files
 * @param  {String}   environment The name of the environment to load config for
 * @param  {Function} callback    Receives an error or the merged config object
 */
config.loadConfigForEnvironment = function (environment, callback) {
    let configDescription, builtConfig = {};
    let inheritedConfigs = [];
    async.series([
        (callback) => {
            // Load configs, following the inheritance chain
            let parent = environment;
            async.whilst(
                () => parent != null,
                (callback) => {
                    fs.readFile(path.join(configDir, `${parent}.yaml`), 'utf-8', (err, data) => {
                        if (ERR(err, callback)) return;
                        configDescription = yaml.safeLoad(data);
                        inheritedConfigs.push(configDescription);
                        parent = configDescription.parent || null;
                        callback(null);
                    });
                },
                (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                }
            );
        },
        (callback) => {
            // Merge the config descriptions, starting at the base and applying
            // successively more specific configs
            const mergedConfig = {};
            for (const desc of inheritedConfigs.reverse()) {
                _.merge(mergedConfig, desc.properties);
            }
            configDescription = mergedConfig;
            callback(null);
        },
        (callback) => {
            // Loop over the description of the config and construct a config
            // object from default values and env var overrides
            for (const itemKey in configDescription) {
                const configItem = configDescription[itemKey];
                if (configItem.default !== undefined) {
                    builtConfig[itemKey] = configItem.default;
                } else {
                    logger.error(`config: ${itemKey} is missing a default for environment ${environment}. skipping...`);
                    continue;
                }
                // Override from env var
                if (configItem.envVar !== undefined && process.env[configItem.envVar] !== undefined) {
                    const envValue = process.env[configItem.envVar];
                    if (typeof configItem.default === 'number') {
                        try {
                            builtConfig[itemKey] = Number.parseFloat(envValue);
                        } catch (e) {
                            logger.warn(`Unable to parse ${configItem.envVar}=${envValue} as number; defaulting to ${configItem.default}`);
                        }
                    } else if (typeof configItem.default === 'boolean') {
                        if (envValue === 'true' || envValue === 'True' || envValue === 1) {
                            builtConfig[itemKey] = true;
                        } else if (envValue === 'false' || envValue === 'False' || envValue === 0) {
                            builtConfig[itemKey] = false;
                        } else {
                            logger.warn(`Unable to parse ${configItem.envVar}=${envValue} as boolean; defaulting to ${configItem.default}`);
                        }
                    } else {
                        builtConfig[itemKey] = envValue;
                    }
                }
            }
            callback(null);
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null, builtConfig);
    });
};

config.loadConfig = function(callback) {
    async.series([
        (callback) => {
            // Determine what environment we're running in
            exportedConfig.env = process.env.NODE_ENV || 'development';
            exportedConfig.isProduction = exportedConfig.env == 'production';
            exportedConfig.isDevelopment = exportedConfig.env == 'development';

            callback(null);
        },
        (callback) => {
            // Load default config from files/environment variables
            config.loadConfigForEnvironment(exportedConfig.env, (err, loadedConfig) => {
                if (ERR(err, callback)) return;
                _.assign(exportedConfig, loadedConfig);
                callback(null);
            });
        },
        (callback) => {
            // Try to grab AWS config from a file; assume Metadata Service will
            // provide credentials if the file is missing
            fs.readFile('./aws-config.json', (err, awsConfig) => {
                if (err) {
                    logger.info('Missing aws-config.json; credentials should be supplied by EC2 Metadata Service');
                    AWS.config.update({'region': 'us-east-2'});
                } else {
                    logger.info('Loading AWS config from aws-config.json');
                    AWS.config.loadFromPath('./aws-config.json');
                    exportedConfig.awsConfig = awsConfig;
                }
                callback(null);
            });
        },
        (callback) => {
            const MetadataService = new AWS.MetadataService();
            MetadataService.request('instance-id', (err, instanceId) => {
                if (!err) {
                    exportedConfig.runningInEc2 = true;
                    exportedConfig.instanceId = instanceId;
                } else {
                    exportedConfig.runningInEc2 = false;
                    if (process.env.INSTANCE_ID) {
                        exportedConfig.instanceId = process.env.INSTANCE_ID;
                    } else {
                        exportedConfig.instanceId = os.hostname();
                    }
                }
                callback(null);
            });
        },
        (callback) => {
            // Initialize CloudWatch logging if it's enabled
            if (exportedConfig.useCloudWatchLogging) {
                const groupName = exportedConfig.globalLogGroup;
                const streamName = exportedConfig.machineId;
                logger.initCloudWatchLogging(groupName, streamName);
                logger.info(`CloudWatch logging enabled! Logging to ${groupName}/${streamName}`);
            }
            callback(null);
        },
        (callback) => {
            if (exportedConfig.queueUrl) {
                logger.info(`Using queue url from config: ${exportedConfig.queueUrl}`);
                callback(null);
            } else {
                logger.info(`Loading url for queue "${exportedConfig.queueName}"`);
                const sqs = new AWS.SQS();
                const params = {
                    QueueName: exportedConfig.queueName
                };
                sqs.getQueueUrl(params, (err, data) => {
                    if (err) {
                        logger.error(`Unable to load url for queue "${exportedConfig.queueName}"`);
                        logger.error(err);
                        process.exit(1);
                    }
                    exportedConfig.queueUrl = data.QueueUrl;
                    logger.info(`Loaded url for queue "${exportedConfig.queueName}": ${exportedConfig.queueUrl}`);
                    callback(null);
                });
            }
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
