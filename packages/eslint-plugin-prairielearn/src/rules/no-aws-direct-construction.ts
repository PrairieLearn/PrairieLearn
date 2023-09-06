function isIdentifierClient(identifierName: string, packageName: string): boolean {
  // If the identifier ends with "Client", include it in the set.
  if (identifierName.endsWith('Client')) {
    return true;
  }

  // If the identifier matches the package name directly, include it in the set.
  const clientName = packageName.replace('@aws-sdk/client-', '');
  const packageIdentifier = clientName.replace(/-/g, '').toLowerCase();
  if (identifierName.toLowerCase() === packageIdentifier) {
    return true;
  }

  return false;
}

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
          context.report({
            node,
            message: 'Do not construct AWS client directly.',
          });
        }
      },
    };
  },
};
