import awsClientMandatoryConfig from './rules/aws-client-mandatory-config.js';
import awsClientSharedConfig from './rules/aws-client-shared-config.js';
import htmlNoDuplicateId from './rules/html-no-duplicate-id.js';
import jsxNoDollarInterpolation from './rules/jsx-no-dollar-interpolation.js';
import noCurrentTargetInCallback from './rules/no-current-target-in-callback.js';
import noHydrateResLocals from './rules/no-hydrate-reslocals.js';
import noUnusedSqlBlocks from './rules/no-unused-sql-blocks.js';
import requireTrpcPermissionMiddleware from './rules/require-trpc-permission-middleware.js';
import safeDbTypes from './rules/safe-db-types.js';

const rules = {
  'aws-client-mandatory-config': awsClientMandatoryConfig,
  'aws-client-shared-config': awsClientSharedConfig,
  'html-no-duplicate-id': htmlNoDuplicateId,
  'jsx-no-dollar-interpolation': jsxNoDollarInterpolation,
  'no-current-target-in-callback': noCurrentTargetInCallback,
  'no-hydrate-reslocals': noHydrateResLocals,
  'no-unused-sql-blocks': noUnusedSqlBlocks,
  'require-trpc-permission-middleware': requireTrpcPermissionMiddleware,
  'safe-db-types': safeDbTypes,
};

export default { rules };
