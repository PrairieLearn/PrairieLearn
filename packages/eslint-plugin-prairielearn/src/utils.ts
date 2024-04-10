/**
 * Determines if the given identifier name corresponds to a client from the
 * given package.
 */
export function isIdentifierClient(identifierName: string, packageName: string): boolean {
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

/**
 * Retrieves the names of AWS clients specified by the given import declaration.
 *
 * For instance, if the import declaration is:
 *
 * ```ts
 * import { S3, S3Client } from '@aws-sdk/client-s3';
 * ```
 *
 * then this function will return a set containing the strings "S3" and "S3Client".
 */
export function getAwsClientNamesFromImportDeclaration(node: any) {
  const clientNames = new Set<string>();

  const importSource = node.source.value;
  if (importSource.startsWith('@aws-sdk/client-')) {
    node.specifiers.forEach((specifier: any) => {
      if (specifier.type === 'ImportSpecifier') {
        const specifierName = specifier.imported.name;
        if (isIdentifierClient(specifierName, importSource)) {
          clientNames.add(specifierName);
        }
      }
    });
  }

  return clientNames;
}

/**
 * Retrieves the names of AWS client specified by the given variable declarator.
 * This is used to handle CJS require statements.
 *
 * For instance, if the variable declarator is:
 *
 * ```ts
 * const { S3, S3Client } = require('@aws-sdk/client-s3');
 * ```
 *
 * then this function will return a set containing the strings "S3" and "S3Client".
 */
export function getAwsClientNamesFromVariableDeclarator(node: any) {
  const clientNames = new Set<string>();

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
        clientNames.add(property.value.name);
      }
    });
  }

  return clientNames;
}
