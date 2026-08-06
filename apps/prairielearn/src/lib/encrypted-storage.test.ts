import * as crypto from 'node:crypto';

import { assert, describe, it } from 'vitest';

import { prairieLearnCiphertextFormat } from '@prairielearn/encrypted-storage';

import { withConfig } from '../tests/utils/config.js';

import { decryptFromStorage, encryptForStorage } from './encrypted-storage.js';

function makeKey() {
  return crypto.randomBytes(32).toString('hex');
}

describe('encrypted storage', () => {
  it('encrypts and decrypts strings with random initialization vectors', () => {
    const first = encryptForStorage('test message');
    const second = encryptForStorage('test message');

    assert.notEqual(first, second);
    assert.equal(decryptFromStorage(first), 'test message');
    assert.equal(decryptFromStorage(encryptForStorage('')), '');
  });

  it('encrypts with the first configured key', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    let ciphertext = '';

    await withConfig({ databaseEncryptionKey: [primaryKey, fallbackKey] }, () => {
      ciphertext = encryptForStorage('secret');
    });

    assert.equal(prairieLearnCiphertextFormat.decrypt(ciphertext, primaryKey), 'secret');
    assert.throws(() => prairieLearnCiphertextFormat.decrypt(ciphertext, fallbackKey));
  });

  it('decrypts existing ciphertext with a fallback key', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const ciphertext = prairieLearnCiphertextFormat.encrypt('secret', fallbackKey);

    await withConfig({ databaseEncryptionKey: [primaryKey, fallbackKey] }, () => {
      assert.equal(decryptFromStorage(ciphertext), 'secret');
    });
  });

  it('fails when no configured key can decrypt ciphertext', async () => {
    const ciphertext = prairieLearnCiphertextFormat.encrypt('secret', makeKey());

    await withConfig({ databaseEncryptionKey: [makeKey(), makeKey()] }, () => {
      assert.throws(
        () => decryptFromStorage(ciphertext),
        'Stored ciphertext could not be decrypted with any configured key',
      );
    });
  });
});
