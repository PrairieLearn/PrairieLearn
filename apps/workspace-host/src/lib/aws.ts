import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { makeAwsConfigProvider } from '@prairielearn/aws';

import { config } from './config';

const awsConfigProvider = makeAwsConfigProvider({
  credentials: fromNodeProviderChain(),
  getClientConfig: () => ({
    region: config.awsRegion,
  }),
  getS3ClientConfig: () => {
    if (!config.runningInEc2) {
      // If we're not running in EC2, assume we're running with a local s3rver instance.
      // See https://github.com/jamhall/s3rver for more details.
      return {
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'S3RVER',
          secretAccessKey: 'S3RVER',
        },
        endpoint: 'http://localhost:5000',
      };
    }

    return {};
  },
});

export const makeAwsClientConfig = awsConfigProvider.makeAwsClientConfig;
export const makeS3ClientConfig = awsConfigProvider.makeS3ClientConfig;
