#!/usr/bin/env node
// Ship a new build of the private library into PL.
//
// Everything is read from PL's config.json `library` entry:
//   library.sourcePath — pre-built CJS bundle in <lib-repo>/dist/library.js
//                        (lib-repo is its parent's parent)
//   library.path       — destination for the AES-256-GCM ciphertext
//
// Public types at apps/prairielearn/src/lib/library-types.d.ts are overwritten
// from <lib-repo>/dist-types/types.d.ts — that path is fixed by PL's import.
//
// Usage:
//   tsx scripts/encrypt-library.mts --key <hex32>

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

interface LibraryConfig {
  sourcePath: string;
  path: string;
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { key: { type: 'string' } },
});

if (!values.key) throw new Error('Usage: tsx scripts/encrypt-library.mts --key <hex32>');
if (!/^[0-9a-f]{64}$/i.test(values.key)) {
  throw new Error('--key must be a 64-character hex string (32 bytes)');
}

const plRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const typesDst = path.join(plRoot, 'apps/prairielearn/src/lib/library-types.d.ts');

async function readLibraryConfig(): Promise<LibraryConfig> {
  const candidates = [
    process.env.PL_CONFIG_PATH,
    path.join(os.homedir(), '.config', 'prairielearn', 'config.json'),
    path.join(plRoot, 'config.json'),
    path.join(plRoot, 'apps', 'prairielearn', 'config.json'),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(await fs.readFile(p, 'utf8'));
      const lib = parsed?.library;
      if (!lib) continue;
      if (typeof lib.sourcePath !== 'string') {
        throw new Error(`library.sourcePath missing from ${p}`);
      }
      if (typeof lib.path !== 'string') {
        throw new Error(`library.path missing from ${p}`);
      }
      return { sourcePath: lib.sourcePath, path: lib.path };
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
  throw new Error('no library config found in PL config.json');
}

const lib = await readLibraryConfig();

const libRepo = path.dirname(path.dirname(lib.sourcePath));
const bundleSrc = path.join(libRepo, 'dist', 'library.js');
const typesSrc = path.join(libRepo, 'dist-types', 'types.d.ts');

for (const p of [bundleSrc, typesSrc]) {
  await fs.access(p).catch(() => {
    throw new Error(`Missing ${p}. Run \`npm run build\` in ${libRepo} before shipping.`);
  });
}

const code = await fs.readFile(bundleSrc, 'utf8');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const iv = crypto.randomBytes(IV_LENGTH);
const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(values.key, 'hex'), iv, {
  authTagLength: AUTH_TAG_LENGTH,
});
const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
const ciphertext = Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64');

await fs.writeFile(lib.path, ciphertext);

const newTypes = await fs.readFile(typesSrc, 'utf8');
const oldTypes = await fs.readFile(typesDst, 'utf8').catch(() => null);
await fs.writeFile(typesDst, newTypes);

console.log(`Encrypted ${path.relative(plRoot, lib.path)} (${code.length} bytes)`);
console.log(
  `${oldTypes !== newTypes ? 'Updated  ' : 'Unchanged'} ${path.relative(plRoot, typesDst)}`,
);
