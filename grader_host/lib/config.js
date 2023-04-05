const ERR = require('async-stacktrace');
const async = require('async');
const AWS = require('aws-sdk');
const _ = require('lodash');

const logger = require('./logger');

const config = module.exports;
const exportedConfig = (config.config = {});
const MetadataService = new AWS.MetadataService();

const defaultConfig = {
  maxConcurrentJobs: 5,
  useDatabase: false,
  useEc2MetadataService: true,
  useCloudWatchLogging: false,
  useConsoleLoggingForJobs: true,
  useImagePreloading: false,
  useHealthCheck: true,
  cacheImageRegistry: null,
  parallelInitPulls: 5,
  lifecycleHeartbeatIntervalMS: 300000,
  globalLogGroup: 'grading-instances-debug',
  jobLogGroup: 'grading-jobs-debug',
  reportLoad: false,
  reportIntervalSec: 10,
  healthCheckPort: 4000,
  healthCheckInterval: 30000,
  jobsQueueName: 'grading_jobs_dev',
  jobsQueueUrl: null,
  resultsQueueName: 'grading_results_dev',
  resultsQueueUrl: null,
  defaultTimeout: 30,
  timeoutOverhead: 300,
  postgresqlHost: 'localhost',
  postgresqlDatabase: 'postgres',
  postgresqlUser: null,
  postgresqlPassword: null,
  postgresqlPoolSize: 2,
  postgresqlIdleTimeoutMillis: 30000,
};

const productionConfig = {
  useDatabase: true,
  useEc2MetadataService: true,
  useCloudWatchLogging: true,
  useConsoleLoggingForJobs: false,
  useImagePreloading: true,
  reportLoad: true,
};

config.loadConfig = function (callback) {
  // Determine what environment we're running in
  const isProduction = process.env.NODE_ENV === 'production';

  _.assign(exportedConfig, {
    ...defaultConfig,
    ...(isProduction ? productionConfig : {}),
  });

  async.series(
    [
      (callback) => {
        MetadataService.request('/latest/dynamic/instance-identity/document', (err, document) => {
          if (ERR(err, callback)) return;
          try {
            const data = JSON.parse(document);
            logger.info('instance-identity', data);
            AWS.config.update({ region: data.region });
            exportedConfig.runningInEc2 = true;
            exportedConfig.instanceId = data.instanceId;
          } catch (err) {
            return callback(err);
          }
          callback(null);
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
