import {
  getAwsClientNamesFromImportDeclaration,
  getAwsClientNamesFromVariableDeclarator,
} from '../utils';

/**
 * This rule enforces that we always explicitly provide a config to AWS clients.
 * This helps ensure that we always construct a client with a specific region.
 *
 * This rules works in tandem with `aws-client-shared-config` to ensure that
 * we're properly configuring AWS SDK clients.
 */
export default {
  create(context: any) {
    const awsClientImports = new Set();

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
          // We're constructing an AWS client. Ensure that the call has at
          // least one argument corresponding to a config object.
          if (node.arguments.length === 0) {
            context.report({
              node,
              message: `${node.callee.name} must be constructed with a config object.`,
            });
            return;
          }
        }
      },
    };
  },
};
