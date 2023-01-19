const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const _ = require('lodash');

/**
 * Module to load configuration from a config file and environment variables.
 */

/**
 * Recursively loads and applies config files.
 *
 * @param  {String}   configDir   The directory containing config files
 * @param  {String}   environment The name of the environment to load config for
 * @param  {Function} callback    Receives an error or the merged config object
 */
module.exports.loadConfigForEnvironment = function (configDir, environment, callback) {
  let configDescription,
    builtConfig = {};
  let inheritedConfigs = [];
  async.series(
    [
      (callback) => {
        fs.access(path.join(configDir, `${environment}.yaml`), fs.constants.F_OK, (err) => {
          if (err) {
            // There's no specific config for this environment
            // Default to the base config
            environment = 'base';
          }
          callback(null);
        });
      },
      (callback) => {
        // Load configs, following the inheritance chain
        let parent = environment;
        async.whilst(
          (callback) => callback(null, parent != null),
          (callback) => {
            fs.readFile(path.join(configDir, `${parent}.yaml`), 'utf-8', (err, data) => {
              if (ERR(err, callback)) return;
              configDescription = yaml.load(data);
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
            callback(new Error(`${itemKey} is missing a default for environment ${environment}`));
            return;
          }
          // Override from env var
          if (configItem.envVar !== undefined && process.env[configItem.envVar] !== undefined) {
            const envValue = process.env[configItem.envVar];
            if (typeof configItem.default === 'number') {
              try {
                builtConfig[itemKey] = Number.parseFloat(envValue);
              } catch (e) {
                callback(new Error(`Unable to parse ${configItem.envVar}=${envValue} as a number`));
                return;
              }
            } else if (typeof configItem.default === 'boolean') {
              if (envValue.toLowerCase() === 'true' || envValue === 1) {
                builtConfig[itemKey] = true;
              } else if (envValue.toLowerCase() === 'false' || envValue === 0) {
                builtConfig[itemKey] = false;
              } else {
                callback(
                  new Error(`Unable to parse ${configItem.envVar}=${envValue} as a boolean`)
                );
                return;
              }
            } else {
              builtConfig[itemKey] = envValue;
            }
          }
        }
        callback(null);
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, builtConfig);
    }
  );
};

/**
 * Loads a config from the specified directory, automatically selecting an
 * environment if needed.
 *
 * @param  {[type]}   configDir    The directory containing config files
 * @param  {Object}   options      Any options
 * @param  {Function} callback     Callback to receive either an error of the loaded config
 */
module.exports.loadConfig = function (configDir, opts, callback) {
  const options = opts || {};
  const env = options.env || process.env.NODE_ENV || 'development';
  module.exports.loadConfigForEnvironment(configDir, env, (err, loadedConfig) => {
    if (ERR(err, callback)) return;
    callback(null, loadedConfig);
  });
};
