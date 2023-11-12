import { SQSClient, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import { AutoScaling } from '@aws-sdk/client-auto-scaling';
import { z } from 'zod';
import {
  ConfigLoader,
  makeImdsConfigSource,
  makeSecretsManagerConfigSource,
} from '@prairielearn/config';

import logger = require('./logger');
import { makeAwsClientConfig } from './aws';

// Determine what environment we're running in
const isProduction = process.env.NODE_ENV === 'production';

const ConfigSchema = z.object({
  maxConcurrentJobs: z.number().default(5),
  useEc2MetadataService: z.boolean().default(true),
  useConsoleLoggingForJobs: z.boolean().default(true),
  useImagePreloading: z.boolean().default(false),
  useHealthCheck: z.boolean().default(true),
  cacheImageRegistry: z.string().nullable().default(null),
  parallelInitPulls: z.number().default(5),
  lifecycleHeartbeatIntervalMS: z.number().default(300000),
  jobLogGroup: z.string().default('grading-jobs-debug'),
  reportLoad: z.boolean().default(false),
  reportIntervalSec: z.number().default(10),
  graderDockerMemory: z.number().default((1 << 30) * 2), // 2GiB
  graderDockerMemorySwap: z.number().default((1 << 30) * 2), // Same as memory, so no access to swap.
  graderDockerKernelMemory: z.number().default(1 << 29), // 512 MiB
  graderDockerDiskQuota: z.number().default(1 << 30), // 1 GiB
  graderDockerCpuPeriod: z.number().default(100000), // microseconds
  graderDockerCpuQuota: z.number().default(90000),
  graderDockerPidsLimit: z.number().default(1024),
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
  visibilityTimeout: z.number().default(60),
  visibilityTimeoutHeartbeatIntervalSec: z.number().default(30),
});

function makeProductionConfigSource() {
  return {
    async load() {
      if (!isProduction) return {};
      return {
        useEc2MetadataService: true,
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
      // We disable this rule because we can't reliably use `makeAwsClientConfig`
      // as a part of the config loading process. This is because it relies on
      // reading the region from the config, which at this point hasn't been
      // loaded yet.
      //
      // This rule is designed to enforce that we share credentials between
      // clients to avoid spamming the IMDS API when creating lots of clients,
      // but this client will really only be used once, typically at application
      // startup.
      // eslint-disable-next-line @prairielearn/aws-client-shared-config
      const autoscaling = new AutoScaling({ region: existingConfig.awsRegion });
      const data = await autoscaling.describeAutoScalingInstances({
        InstanceIds: [existingConfig.instanceId],
      });
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

export const config = loader.config;

export async function loadConfig() {
  await loader.loadAndValidate([
    makeProductionConfigSource(),
    makeImdsConfigSource(),
    makeSecretsManagerConfigSource('ConfSecret'),
    makeAutoScalingGroupConfigSource(),
  ]);

  await getQueueUrl('jobs');
  await getQueueUrl('results');
}

/**
 * Will attempt to load the key [prefix]QueueUrl from config; if that's not
 * present, will use [prefix]QueueName to look up the queue URL with AWS.
 */
async function getQueueUrl(prefix: string) {
  const queueUrlKey = `${prefix}QueueUrl`;
  const queueNameKey = `${prefix}QueueName`;
  if (config[queueUrlKey]) {
    logger.info(`Using queue url from config: ${config[queueUrlKey]}`);
    return;
  }

  const queueName = config[queueNameKey];
  logger.info(`Loading url for queue "${queueName}"`);
  const sqs = new SQSClient(makeAwsClientConfig());
  try {
    const data = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    config[queueUrlKey] = data.QueueUrl;
    logger.info(`Loaded url for queue "${queueName}": ${data.QueueUrl}`);
  } catch (err) {
    logger.error(`Unable to load url for queue "${queueName}"`);
    throw err;
  }
}
