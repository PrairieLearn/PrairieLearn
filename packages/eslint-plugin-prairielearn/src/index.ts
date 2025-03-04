import awsClientMandatoryConfig from './rules/aws-client-mandatory-config.js';
import awsClientSharedConfig from './rules/aws-client-shared-config.js';
import jsxNoCurlyStrings from './rules/jsx-no-curly-strings.js';

export const rules = {
  'aws-client-mandatory-config': awsClientMandatoryConfig,
  'aws-client-shared-config': awsClientSharedConfig,
  'jsx-no-curly-strings': jsxNoCurlyStrings,
};
