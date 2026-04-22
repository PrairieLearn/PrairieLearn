import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

import { logger } from '@prairielearn/logger';

import { config } from './config.js';
import type { Library } from './library-types.js';
import { decrypt } from './symmetric-crypto.js';

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

  let bundlePath: string;
  let code: string;
  if (entry.sourcePath) {
    bundlePath = entry.sourcePath;
    code = await fs.readFile(bundlePath, 'utf8');
  } else if (entry.path && entry.key) {
    bundlePath = entry.path;
    code = decrypt(await fs.readFile(bundlePath, 'utf8'), entry.key);
  } else {
    throw new Error('library requires sourcePath (dev) or path + key (prod)');
  }
  const exported = await evaluateBundle(code, bundlePath);
  if (!exported || typeof exported !== 'object') {
    throw new Error(`Library bundle at ${bundlePath} did not export an object`);
  }
  library = exported as Library;
  logger.info(`Loaded library from ${bundlePath}`);
}

async function evaluateBundle(code: string, bundlePath: string): Promise<unknown> {
  const wrapper = `(async function (module, exports, require, __filename, __dirname) {\n${code}\n})`;
  // Anchor the vm "filename" to this loader's own path so bare-specifier
  // resolution in both `require` and dynamic `import(...)` walks up to PL's
  // node_modules, not the bundle's on-disk location.
  const anchorFilename = fileURLToPath(import.meta.url);
  const fn = vm.runInThisContext(wrapper, {
    filename: anchorFilename,
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  const mod: { exports: unknown } = { exports: {} };
  const localRequire = createRequire(import.meta.url);
  await fn(mod, mod.exports, localRequire, bundlePath, path.dirname(bundlePath));
  return mod.exports;
}

export function resetLibraryForTesting(): void {
  library = null;
}
