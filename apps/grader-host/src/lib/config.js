// @ts-check
const { SQSClient, GetQueueUrlCommand } = require('@aws-sdk/client-sqs');
const { AutoScaling } = require('@aws-sdk/client-auto-scaling');
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
  awsRegion: z.string().default('us-east-2'),
});

function makeProductionConfigSource() {
  return {
    async load() {
      if (!isProduction) return {};
      return {
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
      var autoscaling = new AutoScaling({ region: existingConfig.awsRegion });
      var params = { InstanceIds: [existingConfig.instanceId] };
      const data = await autoscaling.describeAutoScalingInstances(params);
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

module.exports.loadConfig = async function () {
  await loader.loadAndValidate([
    makeProductionConfigSource(),
    makeImdsConfigSource(),
    makeSecretsManagerConfigSource('ConfSecret'),
    makeAutoScalingGroupConfigSource(),
  ]);

  // Initialize CloudWatch logging if it's enabled
  if (module.exports.config.useCloudWatchLogging) {
    const groupName = module.exports.config.globalLogGroup;
    const streamName = module.exports.config.instanceId;
    // @ts-expect-error -- Need to type this better in the future.
    logger.initCloudWatchLogging(groupName, streamName);
    logger.info(`CloudWatch logging enabled! Logging to ${groupName}/${streamName}`);
  }

  await getQueueUrl('jobs');
  await getQueueUrl('results');
};

/**
 * Will attempt to load the key [prefix]QueueUrl from config; if that's not
 * present, will use [prefix]QueueName to look up the queue URL with AWS.
 */
async function getQueueUrl(prefix) {
  const queueUrlKey = `${prefix}QueueUrl`;
  const queueNameKey = `${prefix}QueueName`;
  if (module.exports.config[queueUrlKey]) {
    logger.info(`Using queue url from config: ${module.exports.config[queueUrlKey]}`);
    return;
  }

  const queueName = module.exports.config[queueNameKey];
  logger.info(`Loading url for queue "${queueName}"`);
  const sqs = new SQSClient({ region: module.exports.config.awsRegion });
  try {
    const data = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    module.exports.config[queueUrlKey] = data.QueueUrl;
    logger.info(`Loaded url for queue "${queueName}": ${data.QueueUrl}`);
  } catch (err) {
    logger.error(`Unable to load url for queue "${queueName}"`);
    throw err;
  }
}
