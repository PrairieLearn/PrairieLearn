import { logger } from '@prairielearn/logger';

import { config } from './config.js';
import { loadLibrary } from './library-loader.js';
import type { Library } from './library-types.js';

let library: Library | null = null;

export function getLibrary(): Library | null {
  return library;
}

export function requireLibrary(): Library {
  if (!library) {
    throw new Error('Library is not loaded. Configure `library` in config.json.');
  }
  return library;
}

export async function initLibrary(): Promise<void> {
  library = null;
  const entry = config.library;
  if (!entry) return;

  if (entry.sourcePath && !config.devMode) {
    throw new Error('library.sourcePath is only allowed in devMode');
  }

  const loaded = await loadLibrary({
    sourcePath: entry.sourcePath,
    privateKey: entry.privateKey,
    anchorUrl: import.meta.url,
  });
  library = loaded as Library;
  logger.info('Loaded library');
}

export function resetLibraryForTesting(): void {
  library = null;
}
