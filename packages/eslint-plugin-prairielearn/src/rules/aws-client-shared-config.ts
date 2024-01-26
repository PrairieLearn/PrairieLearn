import {
  getAwsClientNamesFromImportDeclaration,
  getAwsClientNamesFromVariableDeclarator,
} from '../utils';

/**
 * This ESLint rules enforces that we always provide a "shared" config to AWS
 * clients.
 *
 * This rule is extremely opinionated: it checks that the first argument to an
 * AWS client constructor consists of a function call to a function named
 * `makeAwsClientConfig()` (or `makeS3ClientConfig()` for S3 clients). This
 * is our convention to ensure that all clients will reuse credential providers,
 * which is important for ensuring that we don't overload IMDS with requests
 * for credentials if we construct a lot of clients in rapid succession.
 *
 * This is perhaps less than ideal, but the risk of misconfiguring a client is
 * high enough that we err towards being extremely prescriptive about how we
 * configure them.
 *
 * This rules works in tandem with `aws-client-mandatory-config` to ensure that
 * we're properly configuring AWS SDK clients.
 */
export default {
  create(context: any) {
    const awsClientImports = new Set<string>();

    return {
      // Handle `import ...` statements
      ImportDeclaration(node: any) {
        const clientNames = getAwsClientNamesFromImportDeclaration(node);
        clientNames.forEach((clientName) => awsClientImports.add(clientName));
      },
      // Handle `const ... = require(...)` statements
      VariableDeclarator(node: any) {
        const clientNames = getAwsClientNamesFromVariableDeclarator(node);
        clientNames.forEach((clientName) => awsClientImports.add(clientName));
      },
      NewExpression(node: any) {
        if (node.callee.type === 'Identifier' && awsClientImports.has(node.callee.name)) {
          // We're constructing an AWS client. Ensure that the first argument
          // comes from one of our config providers.

          if (node.arguments.length === 0) {
            // There is no argument to check. If the `aws-client-mandatory-config`
            // rule is enabled, it will catch this case.
            return;
          }

          let desiredConfigFunctionName = 'makeAwsClientConfig';

          // Special-case: S3 client.
          if (node.callee.name === 'S3Client' || node.callee.name === 'S3') {
            desiredConfigFunctionName = 'makeS3ClientConfig';
          }

          const configArgument = node.arguments[0];
          if (configArgument.type !== 'CallExpression') {
            context.report({
              node,
              message: `Config for ${node.callee.name} must be obtained by calling ${desiredConfigFunctionName}().`,
            });
            return;
          }

          // Handle member calls to the function.
          if (configArgument.callee.type === 'MemberExpression') {
            const functionName = configArgument.callee.property.name;
            if (functionName !== desiredConfigFunctionName) {
              context.report({
                node,
                message: `Config for ${node.callee.name} must be obtained by calling ${desiredConfigFunctionName}().`,
              });
            }
            return;
          }

          if (configArgument.callee.type === 'Identifier') {
            const functionName = configArgument.callee.name;
            if (functionName !== desiredConfigFunctionName) {
              context.report({
                node,
                message: `Config for ${node.callee.name} must be obtained by calling ${desiredConfigFunctionName}().`,
              });
            }
            return;
          }

          context.report({
            node,
            message: `Unknown config provided to AWS client.`,
          });
        }
      },
    };
  },
};
