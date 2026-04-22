import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import * as jose from 'jose';
import tmp from 'tmp-promise';
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { config } from './config.js';
import { loadLibrary } from './library-loader.js';
import { getLibrary, initLibrary, requireLibrary, resetLibraryForTesting } from './library.js';

const JWE_ALG = 'RSA-OAEP-256';
const JWE_ENC = 'A256GCM';

function freshKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

async function writePlaintextBundle(dir: string, code: string, filename = 'bundle.js') {
  const p = path.join(dir, filename);
  await fs.writeFile(p, code);
  return p;
}

async function writeEncryptedBundle(
  dir: string,
  publicKeyPem: string,
  code: string,
  filename = 'bundle.jwe',
) {
  const key = await jose.importSPKI(publicKeyPem, JWE_ALG);
  const jwe = await new jose.CompactEncrypt(new TextEncoder().encode(code))
    .setProtectedHeader({ alg: JWE_ALG, enc: JWE_ENC })
    .encrypt(key);
  const p = path.join(dir, filename);
  await fs.writeFile(p, jwe);
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
        const lib = (await loadLibrary({
          sourcePath: bundlePath,
          anchorUrl: import.meta.url,
        })) as { generateLaunchLink: (o: { keys: string[] }) => string };
        assert.equal(lib.generateLaunchLink({ keys: ['a', 'b'] }), 'ldb:test:a,b');
      },
      { unsafeCleanup: true },
    );
  });

  it('loads an encrypted JWE bundle via privateKey + blobPath', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const { publicKey, privateKey } = freshKeyPair();
        const blobPath = await writeEncryptedBundle(dir, publicKey, MINIMAL_BUNDLE);
        const lib = (await loadLibrary({
          privateKey,
          blobPath,
          anchorUrl: import.meta.url,
        })) as { generateLaunchLink: (o: { keys: string[] }) => string };
        assert.equal(lib.generateLaunchLink({ keys: ['k'] }), 'ldb:test:k');
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
        const lib = (await loadLibrary({
          sourcePath: bundlePath,
          anchorUrl: import.meta.url,
        })) as { generateLaunchLink: (o: { keys: string[] }) => string };
        assert.equal(lib.generateLaunchLink({ keys: ['x'] }), 'awaited:x');
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
        const lib = (await loadLibrary({
          sourcePath: bundlePath,
          anchorUrl: import.meta.url,
        })) as { generateLaunchLink: (o: { keys: string[] }) => string };
        assert.equal(lib.generateLaunchLink({ keys: ['y'] }), path.sep + 'y');
      },
      { unsafeCleanup: true },
    );
  });

  it('rejects when neither sourcePath nor privateKey is provided', async () => {
    await expect(loadLibrary({ anchorUrl: import.meta.url })).rejects.toThrow(
      /sourcePath or privateKey is required/,
    );
  });

  it('rejects when both sourcePath and privateKey are provided', async () => {
    const { privateKey } = freshKeyPair();
    await expect(
      loadLibrary({ sourcePath: '/nope', privateKey, anchorUrl: import.meta.url }),
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

describe('library', () => {
  const originalLibrary = config.library;
  const originalDevMode = config.devMode;

  beforeEach(() => {
    resetLibraryForTesting();
  });

  afterEach(() => {
    config.library = originalLibrary;
    config.devMode = originalDevMode;
    resetLibraryForTesting();
  });

  it('is a no-op when library is unset', async () => {
    config.library = null;
    await initLibrary();
    assert.isNull(getLibrary());
  });

  it('delegates sourcePath to loadLibrary', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, MINIMAL_BUNDLE);
        config.library = { sourcePath: bundlePath };
        config.devMode = true;

        await initLibrary();

        assert.equal(
          requireLibrary().generateLaunchLink({ keys: ['a'], restartUrl: 'http://x' }),
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
        config.library = { sourcePath: bundlePath };

        await expect(initLibrary()).rejects.toThrow(/only allowed in devMode/);
      },
      { unsafeCleanup: true },
    );
  });

  it('requireLibrary throws when the library is unset', () => {
    config.library = null;
    resetLibraryForTesting();
    assert.throws(() => requireLibrary(), /not loaded/);
  });
});
