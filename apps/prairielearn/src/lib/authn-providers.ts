import { queryRows } from '@prairielearn/postgres';

import { config } from './config.js';
import { type AuthnProvider, AuthnProviderSchema } from './db-types.js';

/**
 * Get supported authentication providers based on configuration.
 * Filters out providers that are not enabled in the application configuration.
 */
export async function getSupportedAuthenticationProviders(): Promise<AuthnProvider[]> {
  const authProviders = await queryRows('SELECT * FROM authn_providers', AuthnProviderSchema);
  return authProviders.filter((row) => {
    if (row.name === 'Shibboleth') {
      return config.hasShib;
    }
    if (row.name === 'Google') {
      return config.hasOauth;
    }
    if (row.name === 'Azure') {
      return config.hasAzure;
    }

    // Default to true for all other providers.
    return true;
  });
}
