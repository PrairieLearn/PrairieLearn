const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const AWS = require('aws-sdk');
const os = require('os');
const _ = require('lodash');
const configLib = require('../../prairielib/lib/config');

const logger = require('./logger');

const configDir = path.resolve(__dirname, '..', 'config');

const config = module.exports;
const exportedConfig = (config.config = {});
const MetadataService = new AWS.MetadataService();

config.loadConfig = function (callback) {
  // Determine what environment we're running in
  const env = (exportedConfig.env = process.env.NODE_ENV || 'development');
  exportedConfig.isProduction = exportedConfig.env === 'production';
  exportedConfig.isDevelopment = exportedConfig.env === 'development';

  async.series(
    [
      (callback) => {
        configLib.loadConfigForEnvironment(configDir, env, (err, loadedConfig) => {
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
            // we don't have the AWS config file, assume we are inside
            // EC2 and that we can get all config info from the
            // metadata service
            logger.info(
              'Missing aws-config.json; credentials should be supplied by EC2 Metadata Service'
            );
            MetadataService.request(
              '/latest/dynamic/instance-identity/document',
              (err, document) => {
                if (ERR(err, callback)) return;
                try {
                  const data = JSON.parse(document);
                  logger.info('instance-identity', data);
                  AWS.config.update({ region: data.region });
                  exportedConfig.instanceIdentity = data;
                  exportedConfig.runningInEc2 = true;
                  exportedConfig.instanceId = data.instanceId;
                } catch (err) {
                  return callback(err);
                }
                callback(null);
              }
            );
          } else {
            // we do have the config file, it should provide all our
            // info and we assume we are not running inside EC2
            logger.info('Loading AWS config from aws-config.json');
            AWS.config.loadFromPath('./aws-config.json');
            exportedConfig.awsConfig = JSON.parse(awsConfig);
            exportedConfig.runningInEc2 = false;
            if (process.env.INSTANCE_ID) {
              exportedConfig.instanceId = process.env.INSTANCE_ID;
            } else {
              exportedConfig.instanceId = os.hostname();
            }
            callback(null);
          }
        });
      },
      (callback) => {
        if (!exportedConfig.runningInEc2) return callback(null);

        // If we are inside EC2, look up a special tag and use its value to
        // find a secret containing configuration data. The secret data
        // must be JSON with a single object, which is the same format
        // (same key names) as our "config" object. We will assign all data
        // from the secret object into our config, overwriting existing
        // properties.
        logger.info('Getting instance tags');
        const ec2 = new AWS.EC2();

        const params = {
          Filters: [{ Name: 'resource-id', Values: [exportedConfig.instanceId] }],
        };
        ec2.describeTags(params, function (err, data) {
          if (ERR(err, callback)) return;
          logger.info('Instance tags', data.Tags);
          const confSecretTag = _.find(data.Tags, { Key: 'ConfSecret' });
          if (confSecretTag == null) return callback(null);

          const SecretId = confSecretTag.Value;
          logger.info(`SecretId: ${SecretId}`);
          const secretsManager = new AWS.SecretsManager();
          secretsManager.getSecretValue({ SecretId }, function (err, data) {
            if (ERR(err, callback)) return;
            logger.info('getSecretValue()', data);
            if (data.SecretString == null) return callback(null);

            try {
              const secretConfig = JSON.parse(data.SecretString);
              logger.info('parsed secretConfig', secretConfig);
              _.assign(exportedConfig, secretConfig);
            } catch (err) {
              return ERR(err, callback);
            }
            callback(null);
          });
        });
      },
      (callback) => {
        // AutoScalingGroup we are inside (if any)
        exportedConfig.autoScalingGroupName = null;
        if (!exportedConfig.runningInEc2) return callback(null);

        logger.info('Detecting AutoScalingGroup...');
        var autoscaling = new AWS.AutoScaling();
        var params = { InstanceIds: [exportedConfig.instanceId] };
        autoscaling.describeAutoScalingInstances(params, function (err, data) {
          if (ERR(err, callback)) return;
          if (data.AutoScalingInstances.length === 1) {
            exportedConfig.autoScalingGroupName = data.AutoScalingInstances[0].AutoScalingGroupName;
            logger.info(`Running inside AutoScalingGroup: ${exportedConfig.autoScalingGroupName}`);
          } else {
            logger.info('Not running inside an AutoScalingGroup');
          }
          callback(null);
        });
      },
      (callback) => {
        // Initialize CloudWatch logging if it's enabled
        if (exportedConfig.useCloudWatchLogging) {
          const groupName = exportedConfig.globalLogGroup;
          const streamName = exportedConfig.instanceId;
          logger.initCloudWatchLogging(groupName, streamName);
          logger.info(`CloudWatch logging enabled! Logging to ${groupName}/${streamName}`);
        }
        callback(null);
      },
      (callback) => {
        getQueueUrl('jobs', callback);
      },
      (callback) => {
        getQueueUrl('results', callback);
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    }
  );
};

/**
 * Will attempt to load the key [prefix]QueueUrl from config; if that's not
 * present, will use [prefix]QueueName to look up the queue URL with AWS.
 */
function getQueueUrl(prefix, callback) {
  const queueUrlKey = `${prefix}QueueUrl`;
  const queueNameKey = `${prefix}QueueName`;
  if (exportedConfig[queueUrlKey]) {
    logger.info(`Using queue url from config: ${exportedConfig[queueUrlKey]}`);
    callback(null);
  } else {
    logger.info(`Loading url for queue "${exportedConfig[queueNameKey]}"`);
    const sqs = new AWS.SQS();
    const params = {
      QueueName: exportedConfig[queueNameKey],
    };
    sqs.getQueueUrl(params, (err, data) => {
      if (err) {
        logger.error(`Unable to load url for queue "${exportedConfig[queueNameKey]}"`);
        logger.error('getQueueUrl error:', err);
        process.exit(1);
      }
      exportedConfig[queueUrlKey] = data.QueueUrl;
      logger.info(
        `Loaded url for queue "${exportedConfig[queueNameKey]}": ${exportedConfig[queueUrlKey]}`
      );
      callback(null);
    });
  }
}
