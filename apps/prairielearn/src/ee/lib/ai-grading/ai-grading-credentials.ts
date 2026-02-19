import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import {
  type CourseInstance,
  CourseInstanceAiGradingCredentialSchema,
  type EnumAiGradingProvider,
} from '../../../lib/db-types.js';
import { decryptFromStorage } from '../../../lib/storage-crypt.js';

const sql = loadSqlEquiv(import.meta.url);

export interface ResolvedProviderKeys {
  openai: { apiKey: string; organization: string | null } | null;
  google: { apiKey: string } | null;
  anthropic: { apiKey: string } | null;
}

/**
 * Resolve AI grading API keys for a course instance.
 *
 * When the course instance has custom API keys enabled, decrypts and returns
 * the stored credentials. Otherwise, returns the platform-wide keys from config.
 */
export async function resolveAiGradingKeys(
  courseInstance: CourseInstance,
): Promise<ResolvedProviderKeys> {
  if (!courseInstance.ai_grading_use_custom_api_keys) {
    return {
      openai:
        config.aiGradingOpenAiApiKey && config.aiGradingOpenAiOrganization
          ? {
              apiKey: config.aiGradingOpenAiApiKey,
              organization: config.aiGradingOpenAiOrganization,
            }
          : null,
      google: config.aiGradingGoogleApiKey ? { apiKey: config.aiGradingGoogleApiKey } : null,
      anthropic: config.aiGradingAnthropicApiKey
        ? { apiKey: config.aiGradingAnthropicApiKey }
        : null,
    };
  }

  const credentials = await queryRows(
    sql.select_credentials_for_course_instance,
    { course_instance_id: courseInstance.id },
    CourseInstanceAiGradingCredentialSchema,
  );

  const keys: ResolvedProviderKeys = {
    openai: null,
    google: null,
    anthropic: null,
  };

  for (const cred of credentials) {
    const decryptedKey = decryptFromStorage(cred.encrypted_secret_key);
    if (cred.provider === 'openai') {
      keys.openai = { apiKey: decryptedKey, organization: null };
    } else if (cred.provider === 'google') {
      keys.google = { apiKey: decryptedKey };
    } else {
      keys.anthropic = { apiKey: decryptedKey };
    }
  }

  return keys;
}

/**
 * Returns the set of providers that have API keys available for the given
 * course instance. Used to determine which models can be selected in the UI.
 */
export async function getAvailableAiGradingProviders(
  courseInstance: CourseInstance,
): Promise<EnumAiGradingProvider[]> {
  const keys = await resolveAiGradingKeys(courseInstance);
  const available: EnumAiGradingProvider[] = [];
  if (keys.openai) available.push('openai');
  if (keys.google) available.push('google');
  if (keys.anthropic) available.push('anthropic');
  return available;
}