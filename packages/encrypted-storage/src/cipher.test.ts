import * as crypto from 'node:crypto';

import { assert, describe, it } from 'vitest';

import { createStorageCipher, getStorageKeyId } from './cipher.js';
import {
  encryptLegacyPrairieLearn,
  encryptLegacyPrairieTest,
  legacyPrairieLearnFormat,
  legacyPrairieTestFormat,
} from './legacy.js';

function makeKey() {
  return crypto.randomBytes(32).toString('hex');
}

describe('createStorageCipher', () => {
  it('encrypts and decrypts the current format', () => {
    const key = makeKey();
    const cipher = createStorageCipher({ keyRing: key });

    const ciphertext = cipher.encrypt('secret');

    assert.match(ciphertext, new RegExp(`^plenc:v1:${getStorageKeyId(key)}:`));
    assert.equal(cipher.decrypt(ciphertext), 'secret');
    assert.deepEqual(cipher.inspect(ciphertext), {
      format: 'v1',
      keyId: getStorageKeyId(key),
      needsRotation: false,
    });
  });

  it('uses a random initialization vector', () => {
    const cipher = createStorageCipher({ keyRing: makeKey() });

    assert.notEqual(cipher.encrypt('secret'), cipher.encrypt('secret'));
  });

  it('defaults to legacy writes during a staged deployment', () => {
    const key = makeKey();
    const cipher = createStorageCipher({
      keyRing: key,
      legacyFormat: legacyPrairieLearnFormat,
    });

    assert.equal(cipher.writeFormat, 'legacy');
    const ciphertext = cipher.encrypt('secret');
    assert.notMatch(ciphertext, /^plenc:/);
    assert.equal(cipher.decrypt(ciphertext), 'secret');
    assert.isTrue(cipher.inspect(ciphertext).needsRotation);
    assert.throws(
      () => cipher.rotate(ciphertext),
      'Ciphertext rotation requires the cipher to use v1 writes',
    );

    const rotated = createStorageCipher({
      keyRing: key,
      legacyFormat: legacyPrairieLearnFormat,
      writeFormat: 'v1',
    }).rotate(ciphertext);
    assert.match(rotated.ciphertext, /^plenc:v1:/);
    assert.equal(cipher.decrypt(rotated.ciphertext), 'secret');
  });

  it('rejects tampered current ciphertext', () => {
    const key = makeKey();
    const cipher = createStorageCipher({ keyRing: key });
    const parts = cipher.encrypt('secret').split(':');
    const payload = Buffer.from(parts[3]!, 'base64url');
    payload[payload.length - 1] ^= 0xff;
    parts[3] = payload.toString('base64url');

    assert.throws(() => cipher.decrypt(parts.join(':')), 'Stored ciphertext failed authentication');
  });

  it('decrypts and rotates current ciphertext encrypted with a fallback key', () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const oldCipher = createStorageCipher({ keyRing: fallbackKey });
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
    });
    const oldCiphertext = oldCipher.encrypt('secret');

    assert.deepEqual(cipher.inspect(oldCiphertext), {
      format: 'v1',
      keyId: getStorageKeyId(fallbackKey),
      needsRotation: true,
    });

    const rotated = cipher.rotate(oldCiphertext);
    assert.isTrue(rotated.rotated);
    assert.notEqual(rotated.ciphertext, oldCiphertext);
    assert.equal(cipher.decrypt(rotated.ciphertext), 'secret');
    assert.isFalse(cipher.inspect(rotated.ciphertext).needsRotation);
  });

  it('does not rewrite current ciphertext', () => {
    const cipher = createStorageCipher({ keyRing: makeKey() });
    const ciphertext = cipher.encrypt('secret');

    assert.deepEqual(cipher.rotate(ciphertext), {
      ciphertext,
      previous: cipher.inspect(ciphertext),
      rotated: false,
    });
  });

  it('decrypts and rotates the legacy PrairieLearn format', () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
      legacyFormat: legacyPrairieLearnFormat,
      writeFormat: 'v1',
    });
    const legacyCiphertext = encryptLegacyPrairieLearn('secret', fallbackKey);

    assert.equal(cipher.decrypt(legacyCiphertext), 'secret');
    assert.deepEqual(cipher.inspect(legacyCiphertext), {
      format: 'prairielearn-v0',
      keyId: getStorageKeyId(fallbackKey),
      needsRotation: true,
    });
    const rotated = cipher.rotate(legacyCiphertext);
    assert.isTrue(rotated.rotated);
    assert.equal(cipher.decrypt(rotated.ciphertext), 'secret');
    assert.equal(cipher.inspect(rotated.ciphertext).format, 'v1');
  });

  it('decrypts and rotates the legacy PrairieTest format', () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
      legacyFormat: legacyPrairieTestFormat,
      writeFormat: 'v1',
    });
    const legacyCiphertext = encryptLegacyPrairieTest('secret', fallbackKey);

    assert.equal(cipher.decrypt(legacyCiphertext), 'secret');
    assert.equal(cipher.inspect(legacyCiphertext).format, 'prairietest-v0');
    const rotated = cipher.rotate(legacyCiphertext);
    assert.isTrue(rotated.rotated);
    assert.equal(cipher.decrypt(rotated.ciphertext), 'secret');
    assert.equal(cipher.inspect(rotated.ciphertext).format, 'v1');
  });

  it('decrypts fixed ciphertext from the production legacy formats', () => {
    const prairieLearnCipher = createStorageCipher({
      keyRing: '00'.repeat(32),
      legacyFormat: legacyPrairieLearnFormat,
    });
    const prairieTestCipher = createStorageCipher({
      keyRing: '11'.repeat(32),
      legacyFormat: legacyPrairieTestFormat,
    });

    assert.equal(
      prairieLearnCipher.decrypt('AAECAwQFBgcICQoL+LlcNnWe+5CtFn+WmGCsaSDGy1IpoLwPrsqgmGYqH78j'),
      'production-secret',
    );
    assert.equal(
      prairieTestCipher.decrypt(
        '57b1032bae920f20dfdbfdcc1b3f61e045:000102030405060708090a0b0c0d0e0f:b844307949a6b08922db686e621d6b10',
      ),
      'production-secret',
    );
  });

  it('decrypts fixed ciphertext from the v1 format', () => {
    const cipher = createStorageCipher({ keyRing: '22'.repeat(32) });

    assert.equal(
      cipher.decrypt(
        'plenc:v1:n3LqDPSVNuPGbHh_cFGG3w:AAECAwQFBgcICQoLNrL4e85O_K1XWDj6IT_RHwDVMLi6omAKfhY7Mly0qsKY',
      ),
      'production-secret',
    );
  });

  it('supports empty legacy plaintext', () => {
    const key = makeKey();
    const prairieLearnCipher = createStorageCipher({
      keyRing: key,
      legacyFormat: legacyPrairieLearnFormat,
    });
    const prairieTestCipher = createStorageCipher({
      keyRing: key,
      legacyFormat: legacyPrairieTestFormat,
    });

    assert.equal(prairieLearnCipher.decrypt(encryptLegacyPrairieLearn('', key)), '');
    assert.equal(prairieTestCipher.decrypt(encryptLegacyPrairieTest('', key)), '');
  });

  it('fails closed for unknown keys, malformed envelopes, and invalid legacy ciphertext', () => {
    const key = makeKey();
    const otherKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: key,
      legacyFormat: legacyPrairieLearnFormat,
    });
    const otherCiphertext = createStorageCipher({ keyRing: otherKey }).encrypt('secret');

    assert.throws(
      () => cipher.decrypt(otherCiphertext),
      'Stored ciphertext references an unconfigured encryption key',
    );
    assert.throws(
      () => cipher.decrypt('plenc:v2:key:payload'),
      'Stored ciphertext uses an unsupported encrypted storage format',
    );
    assert.throws(
      () => cipher.decrypt('not-ciphertext'),
      'Stored ciphertext could not be decrypted with any configured key',
    );
  });

  it('rejects malformed key configuration', () => {
    assert.throws(
      // @ts-expect-error Testing runtime validation for JavaScript callers.
      () => createStorageCipher({ keyRing: [] }),
      'Storage encryption key ring must contain at least one key',
    );
    assert.throws(
      () => createStorageCipher({ keyRing: 'not-a-key' }),
      'Storage encryption keys must be 32-byte hex strings',
    );
    assert.throws(
      () => createStorageCipher({ keyRing: makeKey(), writeFormat: 'legacy' }),
      'A legacy ciphertext format is required for legacy writes',
    );
  });

  it('tolerates duplicate keys for backwards-compatible configuration', () => {
    const key = makeKey();
    const cipher = createStorageCipher({ keyRing: [key, key.toUpperCase()] });

    assert.equal(cipher.decrypt(cipher.encrypt('secret')), 'secret');
  });
});
