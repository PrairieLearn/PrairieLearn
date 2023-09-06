import awsClientConfig from './rules/aws-client-config';
import awsClientSharedConfig from './rules/aws-client-shared-config';

export const rules = {
  'aws-client-mandatory-config': awsClientConfig,
  'aws-client-shared-config': awsClientSharedConfig,
};
