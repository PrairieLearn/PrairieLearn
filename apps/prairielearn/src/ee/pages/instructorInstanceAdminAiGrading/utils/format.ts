import { formatDateYMD } from '@prairielearn/formatter';

import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import { decryptFromStorage } from '../../../../lib/storage-crypt.js';

export interface AiGradingApiKeyCredential {
  id: string;
  provider: EnumAiGradingProvider;
  apiKeyMasked: string;
  dateAdded: string;
}

/** Masks an API key for display, showing only the first 3 and last 4 characters. */
function maskApiKey(key: string): string {
  if (key.length <= 7) return '.'.repeat(7);
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

/** Decrypts and formats a stored credential row for client-side display. */
export function formatCredential(
  cred: {
    id: string;
    provider: string;
    encrypted_secret_key: string;
    created_at: Date;
  },
  displayTimezone: string,
): AiGradingApiKeyCredential {
  const decrypted = decryptFromStorage(cred.encrypted_secret_key);
  return {
    id: cred.id,
    provider: cred.provider as EnumAiGradingProvider,
    apiKeyMasked: maskApiKey(decrypted),
    dateAdded: formatDateYMD(cred.created_at, displayTimezone),
  };
}

/** Formats a stored credential with a fully redacted key (no partial reveal). */
export function formatCredentialRedacted(
  cred: {
    id: string;
    provider: string;
    created_at: Date;
  },
  displayTimezone: string,
): AiGradingApiKeyCredential {
  return {
    id: cred.id,
    provider: cred.provider as EnumAiGradingProvider,
    apiKeyMasked: '........',
    dateAdded: formatDateYMD(cred.created_at, displayTimezone),
  };
}
