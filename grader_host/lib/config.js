// @ts-check
const ERR = require('async-stacktrace');
const async = require('async');
const AWS = require('aws-sdk');
const { z } = require('zod');
const {
  ConfigLoader,
  makeImdsConfigSource,
  makeSecretsManagerConfigSource,
} = require('@prairielearn/config');

const logger = require('./logger');

// Determine what environment we're running in
const isProduction = process.env.NODE_ENV === 'production';

const ConfigSchema = z.object({
  maxConcurrentJobs: z.number().default(5),
  useDatabase: z.boolean().default(false),
  useEc2MetadataService: z.boolean().default(true),
  useCloudWatchLogging: z.boolean().default(false),
  useConsoleLoggingForJobs: z.boolean().default(true),
  useImagePreloading: z.boolean().default(false),
  useHealthCheck: z.boolean().default(true),
  cacheImageRegistry: z.string().nullable().default(null),
  parallelInitPulls: z.number().default(5),
  lifecycleHeartbeatIntervalMS: z.number().default(300000),
  globalLogGroup: z.string().default('grading-instances-debug'),
  jobLogGroup: z.string().default('grading-jobs-debug'),
  reportLoad: z.boolean().default(false),
  reportIntervalSec: z.number().default(10),
  healthCheckPort: z.number().default(4000),
  healthCheckInterval: z.number().default(30000),
  jobsQueueName: z.string().default('grading_jobs_dev'),
  jobsQueueUrl: z.string().nullable().default(null),
  resultsQueueName: z.string().default('grading_results_dev'),
  resultsQueueUrl: z.string().nullable().default(null),
  defaultTimeout: z.number().default(30),
  timeoutOverhead: z.number().default(300),
  postgresqlHost: z.string().default('localhost'),
  postgresqlDatabase: z.string().default('postgres'),
  postgresqlUser: z.string().nullable().default(null),
  postgresqlPassword: z.string().nullable().default(null),
  postgresqlPoolSize: z.number().default(2),
  postgresqlIdleTimeoutMillis: z.number().default(30000),
  autoScalingGroupName: z.string().nullable().default(null),
  instanceId: z.string().nullable().default(null),
  sentryDsn: z.string().nullable().default(null),
  sentryEnvironment: z.string().nullable().default(null),
  awsConfig: z.any().default(null),
  region: z.string().default('us-east-2'),
});

function makeProductionConfigSource() {
  return {
    async load() {
      if (!isProduction) return {};
      return {
        useDatabase: true,
        useEc2MetadataService: true,
        useCloudWatchLogging: true,
        useConsoleLoggingForJobs: false,
        useImagePreloading: true,
        reportLoad: true,
      };
    },
  };
}

function makeAutoScalingGroupConfigSource() {
  return {
    async load(existingConfig) {
      if (!process.env.CONFIG_LOAD_FROM_AWS) return {};

      logger.info('Detecting AutoScalingGroup...');
      var autoscaling = new AWS.AutoScaling({ region: existingConfig.region });
      var params = { InstanceIds: [existingConfig.instanceId] };
      const data = await autoscaling.describeAutoScalingInstances(params).promise();
      if (!data.AutoScalingInstances || data.AutoScalingInstances.length === 0) {
        logger.info('Not running inside an AutoScalingGroup');
        return {};
      }

      const autoScalingGroupName = data.AutoScalingInstances[0].AutoScalingGroupName;
      logger.info(`Running inside AutoScalingGroup: ${autoScalingGroupName}`);
      return { autoScalingGroupName };
    },
  };
}

const loader = new ConfigLoader(ConfigSchema);
module.exports.config = loader.config;

module.exports.loadConfig = function (callback) {
  async.series(
    [
      async () => {
        await loader.loadAndValidate([
          makeProductionConfigSource(),
          makeImdsConfigSource(),
          makeSecretsManagerConfigSource('ConfSecret'),
          makeAutoScalingGroupConfigSource(),
        ]);

        AWS.config.update({ region: loader.config.region });
      },
      (callback) => {
        // Initialize CloudWatch logging if it's enabled
        if (module.exports.config.useCloudWatchLogging) {
          const groupName = module.exports.config.globalLogGroup;
          const streamName = module.exports.config.instanceId;
          // @ts-expect-error -- Need to type this better in the future.
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
  if (module.exports.config[queueUrlKey]) {
    logger.info(`Using queue url from config: ${module.exports.config[queueUrlKey]}`);
    callback(null);
  } else {
    logger.info(`Loading url for queue "${module.exports.config[queueNameKey]}"`);
    const sqs = new AWS.SQS();
    const params = {
      QueueName: module.exports.config[queueNameKey],
    };
    sqs.getQueueUrl(params, (err, data) => {
      if (err) {
        logger.error(`Unable to load url for queue "${module.exports.config[queueNameKey]}"`);
        logger.error('getQueueUrl error:', err);
        process.exit(1);
      }
      module.exports.config[queueUrlKey] = data.QueueUrl;
      logger.info(
        `Loaded url for queue "${module.exports.config[queueNameKey]}": ${module.exports.config[queueUrlKey]}`
      );
      callback(null);
    });
  }
}
