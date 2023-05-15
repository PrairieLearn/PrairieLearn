import { type S3ClientConfig } from '@aws-sdk/client-s3';
import { config } from './config';

/**
 * @param {import('@aws-sdk/client-s3').S3ClientConfig} extraConfig
 * @returns {import('@aws-sdk/client-s3').S3ClientConfig}
 */
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
