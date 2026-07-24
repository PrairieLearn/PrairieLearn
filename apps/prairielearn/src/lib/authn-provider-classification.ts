export function isInstitutionalAuthenticationProvider(name: string | null): boolean {
  return name != null && name !== 'LTI' && name !== 'LTI 1.3';
}

export function hasSamlAsSoleInstitutionalAuthenticationProvider(
  providerNames: (string | null)[],
): boolean {
  const institutionalProviderNames = providerNames.filter(isInstitutionalAuthenticationProvider);
  return institutionalProviderNames.length === 1 && institutionalProviderNames[0] === 'SAML';
}
