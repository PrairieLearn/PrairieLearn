import { ESLintUtils } from '@typescript-eslint/utils';

import { getAwsClientNamesFromImportDeclaration } from '../utils.js';

/**
 * This rule enforces that we always explicitly provide a config to AWS clients.
 * This helps ensure that we always construct a client with a specific region.
 *
 * This rules works in tandem with `aws-client-shared-config` to ensure that
 * we're properly configuring AWS SDK clients.
 */
export default ESLintUtils.RuleCreator.withoutDocs({
  name: 'aws-client-mandatory-config',
  meta: {
    type: 'problem',
    messages: {
      missingConfig: '{{clientName}} must be constructed with a config object.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const awsClientImports = new Set();

    return {
      // Handle `import ...` statements
      ImportDeclaration(node) {
        const clientNames = getAwsClientNamesFromImportDeclaration(node);
        clientNames.forEach((clientName) => awsClientImports.add(clientName));
      },
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && awsClientImports.has(node.callee.name)) {
          // We're constructing an AWS client. Ensure that the call has at
          // least one argument corresponding to a config object.
          if (node.arguments.length === 0) {
            context.report({
              node,
              messageId: 'missingConfig',
              data: {
                clientName: node.callee.name,
              },
            });
            return;
          }
        }
      },
    };
  },
});
