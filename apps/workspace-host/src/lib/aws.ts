import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

import { makeAwsConfigProvider } from '@prairielearn/aws';

import { config } from './config.js';

const awsConfigProvider = makeAwsConfigProvider({
  credentials: fromNodeProviderChain(),
  getClientConfig: () => ({
    region: config.awsRegion,
  }),
  getS3ClientConfig: () => {
    if (!config.runningInEc2) {
      // If we're not running in EC2, assume we're running with a local RustFS instance.
      return {
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'rustfsadmin',
          secretAccessKey: 'rustfsadmin',
        },
        endpoint: 'http://127.0.0.1:5000',
      };
    }

    return {};
  },
});

export const makeAwsClientConfig = awsConfigProvider.makeAwsClientConfig;
export const makeS3ClientConfig = awsConfigProvider.makeS3ClientConfig;
