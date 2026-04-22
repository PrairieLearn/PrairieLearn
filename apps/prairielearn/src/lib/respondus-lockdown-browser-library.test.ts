import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import tmp from 'tmp-promise';
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { loadLibrary } from '@prairielearn/respondus-lockdown-browser';

import { config } from './config.js';
import {
  getLibrary,
  initLibrary,
  requireLibrary,
  resetLibraryForTesting,
} from './respondus-lockdown-browser-library.js';

async function writePlaintextBundle(dir: string, code: string, filename = 'bundle.js') {
  const p = path.join(dir, filename);
  await fs.writeFile(p, code);
  return p;
}

const MINIMAL_BUNDLE = `
  module.exports = {
    generateLaunchLink: (options) => 'ldb:test:' + options.keys.join(','),
  };
`;

describe('loadLibrary', () => {
  it('loads a plaintext bundle via sourcePath', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, MINIMAL_BUNDLE);
        const lib = await loadLibrary({
          sourcePath: bundlePath,
          anchorUrl: import.meta.url,
        });
        assert.equal(
          lib.generateLaunchLink({ keys: ['a', 'b'], restartUrl: 'http://x' }),
          'ldb:test:a,b',
        );
      },
      { unsafeCleanup: true },
    );
  });

  it('supports top-level await inside the bundle', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundle = `
          const prefix = await Promise.resolve('awaited:');
          module.exports = {
            generateLaunchLink: (options) => prefix + options.keys[0],
          };
        `;
        const bundlePath = await writePlaintextBundle(dir, bundle);
        const lib = await loadLibrary({
          sourcePath: bundlePath,
          anchorUrl: import.meta.url,
        });
        assert.equal(lib.generateLaunchLink({ keys: ['x'], restartUrl: '' }), 'awaited:x');
      },
      { unsafeCleanup: true },
    );
  });

  it('gives the bundle access to node builtins via require', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundle = `
          const pathMod = require('node:path');
          module.exports = {
            generateLaunchLink: (options) => pathMod.sep + options.keys[0],
          };
        `;
        const bundlePath = await writePlaintextBundle(dir, bundle);
        const lib = await loadLibrary({
          sourcePath: bundlePath,
          anchorUrl: import.meta.url,
        });
        assert.equal(lib.generateLaunchLink({ keys: ['y'], restartUrl: '' }), path.sep + 'y');
      },
      { unsafeCleanup: true },
    );
  });

  it('rejects when neither sourcePath nor keys is provided', async () => {
    await expect(loadLibrary({ anchorUrl: import.meta.url })).rejects.toThrow(/sourcePath or keys/);
  });

  it('rejects when both sourcePath and keys are provided', async () => {
    await expect(
      loadLibrary({
        sourcePath: '/nope',
        keys: { 'kid-1': '-----BEGIN PRIVATE KEY-----\n...' },
        anchorUrl: import.meta.url,
      }),
    ).rejects.toThrow(/mutually exclusive/);
  });

  it('rejects when the bundle does not export an object', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, 'module.exports = 42;');
        await expect(
          loadLibrary({ sourcePath: bundlePath, anchorUrl: import.meta.url }),
        ).rejects.toThrow(/did not export an object/);
      },
      { unsafeCleanup: true },
    );
  });
});

describe('Respondus LockDown Browser library', () => {
  const originalSourcePath = config.respondusLockdownBrowserSourcePath;
  const originalKeys = config.respondusLockdownBrowserKeys;
  const originalDevMode = config.devMode;

  beforeEach(() => {
    resetLibraryForTesting();
  });

  afterEach(() => {
    config.respondusLockdownBrowserSourcePath = originalSourcePath;
    config.respondusLockdownBrowserKeys = originalKeys;
    config.devMode = originalDevMode;
    resetLibraryForTesting();
  });

  it('is a no-op when both config fields are unset', async () => {
    config.respondusLockdownBrowserSourcePath = null;
    config.respondusLockdownBrowserKeys = null;
    await initLibrary();
    assert.isNull(getLibrary());
  });

  it('delegates sourcePath to loadLibrary', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, MINIMAL_BUNDLE);
        config.respondusLockdownBrowserSourcePath = bundlePath;
        config.respondusLockdownBrowserKeys = null;
        config.devMode = true;

        await initLibrary();

        assert.equal(
          requireLibrary().generateLaunchLink({
            keys: ['a'],
            restartUrl: 'http://x',
          }),
          'ldb:test:a',
        );
      },
      { unsafeCleanup: true },
    );
  });

  it('rejects sourcePath outside of devMode', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, MINIMAL_BUNDLE);
        config.devMode = false;
        config.respondusLockdownBrowserSourcePath = bundlePath;
        config.respondusLockdownBrowserKeys = null;

        await expect(initLibrary()).rejects.toThrow(/only allowed in devMode/);
      },
      { unsafeCleanup: true },
    );
  });

  it('requireLibrary throws when the library is unset', () => {
    config.respondusLockdownBrowserSourcePath = null;
    config.respondusLockdownBrowserKeys = null;
    resetLibraryForTesting();
    assert.throws(() => requireLibrary(), /not loaded/);
  });
});
