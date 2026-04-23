import { logger } from '@prairielearn/logger';
import { type Library, loadLibrary } from '@prairielearn/respondus-lockdown-browser';

import { config } from '../../lib/config.js';

let library: Library | null = null;

export function getRespondusLockdownBrowser(): Library | null {
  return library;
}

export function requireRespondusLockdownBrowser(): Library {
  if (!library) {
    throw new Error(
      'Respondus LockDown Browser library is not loaded. Configure `respondusLockdownBrowserKeys` (or `respondusLockdownBrowserSourcePath` in devMode).',
    );
  }
  return library;
}

export async function initRespondusLockdownBrowser(): Promise<void> {
  library = null;
  const sourcePath = config.respondusLockdownBrowserSourcePath;
  const keys = config.respondusLockdownBrowserKeys;
  if (!sourcePath && !keys) return;

  if (sourcePath && !config.devMode) {
    throw new Error('respondusLockdownBrowserSourcePath is only allowed in devMode');
  }

  library = await loadLibrary({
    sourcePath: sourcePath ?? undefined,
    keys: keys ?? undefined,
    anchorUrl: import.meta.url,
  });
  logger.info('Loaded Respondus LockDown Browser library');
}

export function resetRespondusLockdownBrowserForTesting(): void {
  library = null;
}
