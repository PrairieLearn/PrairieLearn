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
