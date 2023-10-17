import { memoize } from '@smithy/property-provider';
import { AwsCredentialIdentityProvider } from '@smithy/types';

interface AwsClientConfig {
  region: string;
  [key: string]: any;
}

// Attempt to refresh credentials 5 minutes before they actually expire.
// This value is the same value that the AWS SDK uses internally:
// https://github.com/aws/aws-sdk-js-v3/blob/3f8b581af7c0c8146c5b111f92ba6a024310c525/packages/middleware-signing/src/awsAuthConfiguration.ts#L18
const CREDENTIAL_EXPIRE_WINDOW = 300000;

export function makeAwsConfigProvider({
  credentials,
  getClientConfig,
  getS3ClientConfig,
}: {
  credentials: AwsCredentialIdentityProvider;
  getClientConfig: () => AwsClientConfig;
  getS3ClientConfig?: () => Record<string, any>;
}) {
  // Clients don't share credentials by default, which means that we'll flood
  // the IMDS with requests for credentials if we construct and use a lot of
  // clients in quick succession. IMDS has rate-limiting, so we'll end up failing
  // to get credentials.
  //
  // To work around this, we'll share a single credential provider chain across
  // all clients we create. We'll also memoize the credential provider chain so
  // that we don't end up making unnecessarily many requests to the IMDS.
  //
  // Memoization is based on the following:
  // https://github.com/aws/aws-sdk-js-v3/blob/3f8b581af7c0c8146c5b111f92ba6a024310c525/packages/middleware-signing/src/awsAuthConfiguration.ts#L257
  const memoizedCredentials = memoize(
    credentials,
    (credentials) =>
      credentials.expiration !== undefined &&
      credentials.expiration.getTime() - Date.now() < CREDENTIAL_EXPIRE_WINDOW,
    (credentials) => credentials.expiration !== undefined,
  );

  function makeAwsClientConfig<T extends Record<string, any>>(extraConfig: T = {} as T) {
    return {
      endpoint: process.env.AWS_ENDPOINT,
      credentials: memoizedCredentials,
      ...getClientConfig(),
      ...extraConfig,
    };
  }

  function makeS3ClientConfig<T extends Record<string, any>>(extraConfig: T = {} as T) {
    return makeAwsClientConfig({
      ...(getS3ClientConfig?.() ?? {}),
      ...extraConfig,
    });
  }

  return {
    makeAwsClientConfig,
    makeS3ClientConfig,
  };
}
