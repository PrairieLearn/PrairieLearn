import * as crypto from 'node:crypto';

import { assert, describe, it } from 'vitest';

import { type StorageCiphertextFormat, createStorageCipher } from './cipher.js';
import { prairieLearnCiphertextFormat, prairieTestCiphertextFormat } from './formats.js';

function makeKey() {
  return crypto.randomBytes(32).toString('hex');
}

const formats: {
  name: string;
  format: StorageCiphertextFormat;
  productionKey: string;
  productionCiphertext: string;
}[] = [
  {
    name: 'PrairieLearn',
    format: prairieLearnCiphertextFormat,
    productionKey: '00'.repeat(32),
    productionCiphertext: 'AAECAwQFBgcICQoL+LlcNnWe+5CtFn+WmGCsaSDGy1IpoLwPrsqgmGYqH78j',
  },
  {
    name: 'PrairieTest',
    format: prairieTestCiphertextFormat,
    productionKey: '11'.repeat(32),
    productionCiphertext:
      '57b1032bae920f20dfdbfdcc1b3f61e045:000102030405060708090a0b0c0d0e0f:b844307949a6b08922db686e621d6b10',
  },
];

describe.each(formats)(
  '$name storage cipher',
  ({ format, productionKey, productionCiphertext }) => {
    it('encrypts with the primary key and uses random initialization vectors', () => {
      const primaryKey = makeKey();
      const fallbackKey = makeKey();
      const cipher = createStorageCipher({ keyRing: [primaryKey, fallbackKey], format });

      const first = cipher.encrypt('secret');
      const second = cipher.encrypt('secret');

      assert.notEqual(first, second);
      assert.equal(cipher.decrypt(first), 'secret');
      assert.doesNotThrow(() => format.decrypt(first, primaryKey));
      assert.throws(() => format.decrypt(first, fallbackKey));
      assert.isFalse(cipher.needsRotation(first));
      assert.isNull(cipher.rotate(first));
    });

    it('decrypts and rotates ciphertext encrypted with a fallback key', () => {
      const primaryKey = makeKey();
      const fallbackKey = makeKey();
      const cipher = createStorageCipher({ keyRing: [primaryKey, fallbackKey], format });
      const oldCiphertext = format.encrypt('secret', fallbackKey);

      assert.equal(cipher.decrypt(oldCiphertext), 'secret');
      assert.isTrue(cipher.needsRotation(oldCiphertext));

      const rotated = cipher.rotate(oldCiphertext);
      assert.isNotNull(rotated);
      assert.equal(format.decrypt(rotated, primaryKey), 'secret');
      assert.throws(() => format.decrypt(rotated, fallbackKey));
      assert.isFalse(cipher.needsRotation(rotated));
    });

    it('decrypts fixed production ciphertext', () => {
      const cipher = createStorageCipher({ keyRing: productionKey, format });

      assert.equal(cipher.decrypt(productionCiphertext), 'production-secret');
    });

    it('supports empty plaintext and rejects tampering', () => {
      const key = makeKey();
      const cipher = createStorageCipher({ keyRing: key, format });
      const ciphertext = cipher.encrypt('');

      assert.equal(cipher.decrypt(ciphertext), '');
      assert.throws(() => cipher.decrypt(`${ciphertext}00`));
    });
  },
);

describe('createStorageCipher', () => {
  it('fails when no configured key can decrypt ciphertext', () => {
    const ciphertext = prairieLearnCiphertextFormat.encrypt('secret', makeKey());
    const cipher = createStorageCipher({
      keyRing: [makeKey(), makeKey()],
      format: prairieLearnCiphertextFormat,
    });

    assert.throws(
      () => cipher.decrypt(ciphertext),
      'Stored ciphertext could not be decrypted with any configured key',
    );
  });

  it('rejects malformed key configuration', () => {
    assert.throws(
      // @ts-expect-error Testing runtime validation for JavaScript callers.
      () => createStorageCipher({ keyRing: [], format: prairieLearnCiphertextFormat }),
      'Storage encryption key ring must contain at least one key',
    );
    assert.throws(
      () => createStorageCipher({ keyRing: 'not-a-key', format: prairieLearnCiphertextFormat }),
      'Storage encryption keys must be 32-byte hex strings',
    );
  });

  it('tolerates duplicate keys for backwards-compatible configuration', () => {
    const key = makeKey();
    const cipher = createStorageCipher({
      keyRing: [key, key.toUpperCase()],
      format: prairieLearnCiphertextFormat,
    });

    assert.equal(cipher.decrypt(cipher.encrypt('secret')), 'secret');
  });
});
