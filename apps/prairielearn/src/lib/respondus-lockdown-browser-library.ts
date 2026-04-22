import { logger } from '@prairielearn/logger';
import { loadLibrary } from '@prairielearn/respondus-lockdown-browser';
import type { Library } from '@prairielearn/respondus-lockdown-browser/types';

import { config } from './config.js';

let library: Library | null = null;

export function getLibrary(): Library | null {
  return library;
}

export function requireLibrary(): Library {
  if (!library) {
    throw new Error(
      'Respondus LockDown Browser library is not loaded. Configure `respondusLockdownBrowserKeys` (or `respondusLockdownBrowserSourcePath` in devMode).',
    );
  }
  return library;
}

export async function initLibrary(): Promise<void> {
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

export function resetLibraryForTesting(): void {
  library = null;
}
