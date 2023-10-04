import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { makeAwsConfigProvider } from '@prairielearn/aws';

import { config } from './config';

const awsConfigProvider = makeAwsConfigProvider({
  credentials: fromNodeProviderChain(),
  getClientConfig: () => ({
    region: config.awsRegion,
  }),
});

export const makeAwsClientConfig = awsConfigProvider.makeAwsClientConfig;
export const makeS3ClientConfig = awsConfigProvider.makeS3ClientConfig;
