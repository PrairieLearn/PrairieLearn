import { type S3ClientConfig } from '@aws-sdk/client-s3';
import { config } from './config';
import objectHash = require('object-hash');

export function makeS3ClientConfig(extraConfig: S3ClientConfig = {}): S3ClientConfig {
  const newConfig = makeAwsClientConfig(extraConfig);

  if (!config.runningInEc2) {
    // If we're not running in EC2, assume we're running with a local s3rver instance.
    // See https://github.com/jamhall/s3rver for more details.
    newConfig.forcePathStyle = true;
    newConfig.credentials = {
      accessKeyId: 'S3RVER',
      secretAccessKey: 'S3RVER',
    };
    newConfig.endpoint = 'http://localhost:5000';
  }

  return newConfig;
}

export function makeAwsClientConfig<T extends Record<string, any> = object>(extraConfig = {} as T) {
  return {
    region: config.awsRegion,
    endpoint: process.env.AWS_ENDPOINT,
    ...extraConfig,
  };
}

/**
 * Two-level cache for AWS clients. The first level is the constructor, and the
 * second level is the hash of the config.
 */
const awsClientCache = new Map<new (config: Record<string, any>) => any, Map<string, any>>();

export function getAwsClient<T, U extends Record<string, any> = object>(
  ctor: new (config: U) => T,
  config: U,
): T {
  const configHash = objectHash(config);
  let clientConfigCache = awsClientCache.get(ctor);

  if (!clientConfigCache) {
    clientConfigCache = new Map();
    awsClientCache.set(ctor, clientConfigCache);
  }

  let client = clientConfigCache.get(configHash);

  if (!client) {
    client = new ctor(config);
    clientConfigCache.set(configHash, client);
  }

  return client;
}
