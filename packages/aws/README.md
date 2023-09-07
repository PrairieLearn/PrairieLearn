# `@prairielearn/aws`

This package contains utilities that help us correctly configure AWS SDK clients.

## Usage

Create a config provider with `makeAwsConfigProvider`:

```ts
import { makeAwsConfigProvider } from '@prairielearn/aws';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

import { config } from './config';

const awsConfigProvider = makeAwsConfigProvider({
  credentials: fromNodeProviderChain(),
  getClientConfig: () => ({
    region: config.awsRegion,
  }),
});

export const getAwsClientConfig = awsConfigProvider.getAwsClientConfig;
export const getS3ClientConfig = awsConfigProvider.getS3ClientConfig;
```

Then, use the `getAwsClientConfig` and `getS3ClientConfig` functions to configure AWS clients:

```ts
import { EC2Client } from '@aws-sdk/client-ec2';
import { S3Client } from '@aws-sdk/client-s3';

const ec2 = new EC2Client(getAwsClientConfig());
const s3 = new S3Client(getS3ClientConfig());
```

### Providing extra config

The `get...` functions support passing in extra config. If this extra config conflicts with other config, such as that returned from `getClientConfig()`, this extra config will take precedence.

```ts
const s3 = new S3Client(
  getS3ClientConfig({
    retries: 3,
  }),
);
```

### Customizing S3 config

The config for S3 clients can be customized independently to support pointing it to other S3-compatible stores.

For instance, to use [`s3rver`](https://github.com/jamhall/s3rver) when running in dev mode, you could use something like the following config:

```ts
const awsConfigProvider = makeAwsConfigProvider({
  credentials: fromNodeProviderChain(),
  getClientConfig: () => ({
    region: config.awsRegion,
  }),
  getS3ClientConfig: () => {
    if (process.env.NODE_ENV !== 'production') {
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
```
