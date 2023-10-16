import awsClientMandatoryConfig from './rules/aws-client-mandatory-config';
import awsClientSharedConfig from './rules/aws-client-shared-config';

export const rules = {
  'aws-client-mandatory-config': awsClientMandatoryConfig,
  'aws-client-shared-config': awsClientSharedConfig,
};
