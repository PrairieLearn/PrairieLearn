import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

import * as jose from 'jose';

/**
 * JWE parameters. Must stay identical to the values the publisher
 * (`prairielearn/respondus-lockdown-browser`) sets on its protected header.
 */
const JWE_ALG = 'RSA-OAEP-256';
const JWE_ENC = 'A256GCM';

const DEFAULT_BLOB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'extensions',
  'library.jwe',
);

export interface LoadLibraryOptions {
  /**
   * Dev-only: path to an unencrypted CJS bundle on disk. Mutually exclusive with `privateKey`.
   */
  sourcePath?: string;
  /**
   * PEM PKCS#8 RSA private key used to decrypt the packaged JWE blob. Mutually exclusive with `sourcePath`.
   */
  privateKey?: string;
  /**
   * Override for the encrypted blob path. Defaults to `extensions/library.jwe` next to this file.
   * Only test code should set this; production callers rely on the default.
   */
  blobPath?: string;
  /**
   * `import.meta.url` of the caller. Used to anchor VM bare-specifier resolution (both `require(...)`
   * and dynamic `import(...)` inside the bundle) to the caller's `node_modules` tree rather than
   * the loader's install location.
   */
  anchorUrl: string;
}

export async function loadLibrary(options: LoadLibraryOptions): Promise<unknown> {
  if (options.sourcePath && options.privateKey) {
    throw new Error('loadLibrary: sourcePath and privateKey are mutually exclusive');
  }

  let code: string;
  let bundlePath: string;
  if (options.sourcePath) {
    bundlePath = options.sourcePath;
    code = await fs.readFile(bundlePath, 'utf8');
  } else if (options.privateKey) {
    bundlePath = options.blobPath ?? DEFAULT_BLOB_PATH;
    const jwe = await fs.readFile(bundlePath, 'utf8');
    const key = await jose.importPKCS8(options.privateKey, JWE_ALG);
    const { plaintext } = await jose.compactDecrypt(jwe, key, {
      keyManagementAlgorithms: [JWE_ALG],
      contentEncryptionAlgorithms: [JWE_ENC],
    });
    code = new TextDecoder().decode(plaintext);
  } else {
    throw new Error('loadLibrary: sourcePath or privateKey is required');
  }

  const exported = await evaluateBundle(code, bundlePath, options.anchorUrl);
  if (!exported || typeof exported !== 'object') {
    throw new Error(`Library bundle at ${bundlePath} did not export an object`);
  }
  return exported;
}

async function evaluateBundle(
  code: string,
  bundlePath: string,
  anchorUrl: string,
): Promise<unknown> {
  const wrapper = `(async function (module, exports, require, __filename, __dirname) {\n${code}\n})`;
  const anchorFilename = fileURLToPath(anchorUrl);
  const fn = vm.runInThisContext(wrapper, {
    filename: anchorFilename,
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  const mod: { exports: unknown } = { exports: {} };
  const localRequire = createRequire(anchorUrl);
  await fn(mod, mod.exports, localRequire, bundlePath, path.dirname(bundlePath));
  return mod.exports;
}
