import {
  getAwsClientNamesFromImportDeclaration,
  getAwsClientNamesFromVariableDeclarator,
} from '../utils';

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
          }

          let desiredConfigFunctionName = 'makeAwsClientConfig';

          // Special-case: S3 client.
          if (node.callee.name === 'S3Client' || node.callee.name === 'S3') {
            desiredConfigFunctionName = 'makeS3ClientConfig';
          }

          const configArgument = node.arguments[0];
          console.log(configArgument);
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
