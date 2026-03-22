/**
 * Determines if the given identifier name corresponds to a client from the
 * given package.
 */
function isIdentifierClient(identifierName: string, packageName: string): boolean {
  // If the identifier ends with "Client", include it in the set.
  if (identifierName.endsWith('Client')) {
    return true;
  }

  // If the identifier matches the package name directly, include it in the set.
  const clientName = packageName.replace('@aws-sdk/client-', '');
  const packageIdentifier = clientName.replaceAll('-', '').toLowerCase();
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
