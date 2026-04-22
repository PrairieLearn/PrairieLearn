import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import tmp from 'tmp-promise';
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { config } from './config.js';
import { getLibrary, initLibrary, requireLibrary, resetLibraryForTesting } from './library.js';
import { encrypt } from './symmetric-crypto.js';

function freshKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function writePlaintextBundle(dir: string, code: string, filename = 'bundle.js') {
  const bundlePath = path.join(dir, filename);
  await fs.writeFile(bundlePath, code);
  return bundlePath;
}

async function writeEncryptedBundle(dir: string, key: string, code: string, filename = 'bundle.js') {
  const bundlePath = path.join(dir, filename);
  await fs.writeFile(bundlePath, encrypt(code, key));
  return bundlePath;
}

const MINIMAL_BUNDLE = `
  module.exports = {
    generateLaunchLink: (options) => 'ldb:test:' + options.keys.join(','),
  };
`;

describe('library', () => {
  const originalLibrary = config.library;

  beforeEach(() => {
    resetLibraryForTesting();
  });

  afterEach(() => {
    config.library = originalLibrary;
    resetLibraryForTesting();
  });

  it('is a no-op when library is unset', async () => {
    config.library = null;
    await initLibrary();
    assert.isNull(getLibrary());
  });

  it('loads a plaintext bundle via sourcePath', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, MINIMAL_BUNDLE);
        config.library = { sourcePath: bundlePath };

        await initLibrary();

        const lib = requireLibrary();
        assert.equal(
          lib.generateLaunchLink({ keys: ['a', 'b'], restartUrl: 'http://x' }),
          'ldb:test:a,b',
        );
      },
      { unsafeCleanup: true },
    );
  });

  it('loads an encrypted bundle via path + key', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const key = freshKey();
        const bundlePath = await writeEncryptedBundle(dir, key, MINIMAL_BUNDLE);
        config.library = { path: bundlePath, key };

        await initLibrary();

        assert.equal(
          requireLibrary().generateLaunchLink({ keys: ['k'], restartUrl: '' }),
          'ldb:test:k',
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
        config.library = { sourcePath: bundlePath };

        await initLibrary();

        assert.equal(
          requireLibrary().generateLaunchLink({ keys: ['x'], restartUrl: '' }),
          'awaited:x',
        );
      },
      { unsafeCleanup: true },
    );
  });

  it('gives the bundle access to node builtins via require', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundle = `
          const path = require('node:path');
          module.exports = {
            generateLaunchLink: (options) => path.sep + options.keys[0],
          };
        `;
        const bundlePath = await writePlaintextBundle(dir, bundle);
        config.library = { sourcePath: bundlePath };

        await initLibrary();

        assert.equal(
          requireLibrary().generateLaunchLink({ keys: ['y'], restartUrl: '' }),
          path.sep + 'y',
        );
      },
      { unsafeCleanup: true },
    );
  });

  it('rejects a library entry with neither sourcePath nor path+key', async () => {
    config.library = {};
    await expect(initLibrary()).rejects.toThrow(/sourcePath.*path \+ key/);
  });

  it('rejects sourcePath outside of devMode', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, MINIMAL_BUNDLE);
        const originalDevMode = config.devMode;
        config.devMode = false;
        config.library = { sourcePath: bundlePath };

        try {
          await expect(initLibrary()).rejects.toThrow(/only allowed in devMode/);
        } finally {
          config.devMode = originalDevMode;
        }
      },
      { unsafeCleanup: true },
    );
  });

  it('requireLibrary throws when the library is unset', () => {
    config.library = null;
    resetLibraryForTesting();
    assert.throws(() => requireLibrary(), /not loaded/);
  });

  it('throws when the bundle file does not exist (sourcePath)', async () => {
    config.library = { sourcePath: '/nonexistent/path/to/bundle.js' };
    await expect(initLibrary()).rejects.toThrow(/ENOENT/);
  });

  it('throws when decrypting with the wrong key', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const key = freshKey();
        const wrongKey = freshKey();
        const bundlePath = await writeEncryptedBundle(dir, key, MINIMAL_BUNDLE);
        config.library = { path: bundlePath, key: wrongKey };

        await expect(initLibrary()).rejects.toThrow();
      },
      { unsafeCleanup: true },
    );
  });

  it('throws when the ciphertext has been tampered with', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const key = freshKey();
        const bundlePath = await writeEncryptedBundle(dir, key, MINIMAL_BUNDLE);

        const ciphertext = await fs.readFile(bundlePath, 'utf8');
        const buf = Buffer.from(ciphertext, 'base64');
        buf[buf.length - 1] ^= 0xff;
        await fs.writeFile(bundlePath, buf.toString('base64'));

        config.library = { path: bundlePath, key };

        await expect(initLibrary()).rejects.toThrow();
      },
      { unsafeCleanup: true },
    );
  });

  it('throws when the bundle does not export an object', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, 'module.exports = 42;');
        config.library = { sourcePath: bundlePath };

        await expect(initLibrary()).rejects.toThrow(/did not export an object/);
      },
      { unsafeCleanup: true },
    );
  });

  it('throws when the bundle has a syntax error', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, 'this is not valid js {{{');
        config.library = { sourcePath: bundlePath };

        await expect(initLibrary()).rejects.toThrow();
      },
      { unsafeCleanup: true },
    );
  });
});
