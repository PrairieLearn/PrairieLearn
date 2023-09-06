export default {
  create(context: any) {
    const awsClientImports = new Set();

    return {
      ImportDeclaration(node: any) {
        const importSource = node.source.value;
        if (importSource.startsWith('@aws-sdk/client-')) {
          node.specifiers.forEach((specifier: any) => {
            if (specifier.type === 'ImportSpecifier') {
              const specifierName = specifier.imported.name;
              // If the identifier ends with "Client", include it in the set.
              if (specifierName.endsWith('Client')) {
                awsClientImports.add(specifierName);
              }

              // If the identifier matches the package name directly, include it in the set.
              const packageName = importSource.replace('@aws-sdk/client-', '');
              const packageIdentifier = packageName.replace(/-/g, '').toLowerCase();
              if (specifierName.toLowerCase() === packageIdentifier) {
                awsClientImports.add(specifierName);
              }
            }
          });
        }
        if (awsClientImports.size > 0) {
          console.log(awsClientImports);
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
