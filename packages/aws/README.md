# `@prairielearn/aws`

This package contains utilities that help us correctly configure AWS SDK clients.

Specifically, it's meant to address the fact that clients from the v3 AWS SDK don't share resolved credentials with each other. This means that, by default, every time a new client is created, it has to independently resolve credentials for itself. In production, this is problematic, as that requires talking to the IMDS, which will throttle requests if we make a ton of them in rapid succession. This results in clients being unable to obtain credentials, and thus the AWS API operations fail.

We resolve this with this package, which helps ensure that all AWS SDk clients are constructed with a shared and memoized credential provider.

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

export const makeAwsClientConfig = awsConfigProvider.makeAwsClientConfig;
export const makeS3ClientConfig = awsConfigProvider.makeS3ClientConfig;
```

Then, use the `makeAwsClientConfig` and `makeS3ClientConfig` functions to configure AWS clients:

```ts
import { EC2Client } from '@aws-sdk/client-ec2';
import { S3Client } from '@aws-sdk/client-s3';

const ec2 = new EC2Client(makeAwsClientConfig());
const s3 = new S3Client(makeS3ClientConfig());
```

### Providing extra config

The `get...` functions support passing in extra config. If this extra config conflicts with other config, such as that returned from `getClientConfig()`, this extra config will take precedence.

```ts
const s3 = new S3Client(
  makeS3ClientConfig({
    maxAttempts: 3,
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
  makeS3ClientConfig: () => {
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
