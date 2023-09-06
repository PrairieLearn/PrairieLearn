import { isIdentifierClient } from '../utils';

export default {
  create(context: any) {
    const awsClientImports = new Set();

    return {
      // Handle `import ...` statements
      ImportDeclaration(node: any) {
        const importSource = node.source.value;
        if (importSource.startsWith('@aws-sdk/client-')) {
          node.specifiers.forEach((specifier: any) => {
            if (specifier.type === 'ImportSpecifier') {
              const specifierName = specifier.imported.name;
              if (isIdentifierClient(specifierName, importSource)) {
                awsClientImports.add(specifierName);
              }
            }
          });
        }
        if (awsClientImports.size > 0) {
          console.log(awsClientImports);
        }
      },
      // Handle `const ... = require(...)` statements
      VariableDeclarator(node: any) {
        if (
          node.init &&
          node.init.type === 'CallExpression' &&
          node.init.callee.name === 'require' &&
          node.init.arguments.length === 1 &&
          node.init.arguments[0].type === 'Literal' &&
          typeof node.init.arguments[0].value === 'string' &&
          node.init.arguments[0].value.startsWith('@aws-sdk/client-')
        ) {
          if (node.id.type !== 'ObjectPattern') {
            throw new Error('Unexpected node type');
          }

          node.id.properties.forEach((property: any) => {
            const specifierName = property.key.name;
            if (isIdentifierClient(specifierName, node.init.arguments[0].value)) {
              awsClientImports.add(property.value.name);
            }
          });
        }
      },
      NewExpression(node: any) {
        if (node.callee.type === 'Identifier' && awsClientImports.has(node.callee.name)) {
          // We're constructing an AWS client. Ensure that the first argument
          // comes from one of our config providers.

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
