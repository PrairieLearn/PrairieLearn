import * as crypto from 'node:crypto';

import { assert, describe, it } from 'vitest';

import { encryptLegacyPrairieLearn } from '@prairielearn/encrypted-storage';

import { withConfig } from '../tests/utils/config.js';

import { decryptFromStorage, encryptForStorage } from './encrypted-storage.js';

describe('encrypted storage', () => {
  it('can encrypt and decrypt a string', () => {
    const plaintext = 'test message';
    const ciphertext = encryptForStorage(plaintext);
    const decrypted = decryptFromStorage(ciphertext);
    assert.equal(decrypted, plaintext);
  });

  it('encrypting the same plaintext twice produces different ciphertext', () => {
    const plaintext = 'test message';
    const a = encryptForStorage(plaintext);
    const b = encryptForStorage(plaintext);
    assert.notEqual(a, b);
  });

  it('decrypting with wrong key throws', async () => {
    const keyA = crypto.randomBytes(32).toString('hex');
    const keyB = crypto.randomBytes(32).toString('hex');
    const ciphertext = encryptLegacyPrairieLearn('secret', keyA);
    await withConfig({ databaseEncryptionKey: [keyB] }, () => {
      assert.throws(() => decryptFromStorage(ciphertext));
    });
  });

  it('tampered ciphertext throws', async () => {
    const key = crypto.randomBytes(32).toString('hex');
    const ciphertext = encryptLegacyPrairieLearn('secret', key);
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    await withConfig({ databaseEncryptionKey: [key] }, () => {
      assert.throws(() => decryptFromStorage(tampered));
    });
  });

  it('empty string round-trips', () => {
    const ciphertext = encryptForStorage('');
    assert.equal(decryptFromStorage(ciphertext), '');
  });

  it('encrypts with the first key', async () => {
    const activeKey = crypto.randomBytes(32).toString('hex');
    const oldKey = crypto.randomBytes(32).toString('hex');
    let ciphertext = '';

    await withConfig(
      { databaseEncryptionKey: [activeKey, oldKey], databaseEncryptionWriteFormat: 'v1' },
      () => {
        ciphertext = encryptForStorage('secret');
      },
    );
    assert.match(ciphertext, /^plenc:v1:/);
    await withConfig({ databaseEncryptionKey: [activeKey] }, () => {
      assert.equal(decryptFromStorage(ciphertext), 'secret');
    });
    await withConfig({ databaseEncryptionKey: [oldKey] }, () => {
      assert.throws(() => decryptFromStorage(ciphertext));
    });
  });

  it('decrypts ciphertext with a fallback key', async () => {
    const activeKey = crypto.randomBytes(32).toString('hex');
    const oldKey = crypto.randomBytes(32).toString('hex');
    const ciphertext = encryptLegacyPrairieLearn('secret', oldKey);

    await withConfig({ databaseEncryptionKey: [activeKey, oldKey] }, () => {
      assert.equal(decryptFromStorage(ciphertext), 'secret');
    });
  });

  it('fails when no configured key can decrypt ciphertext', async () => {
    const ciphertext = encryptLegacyPrairieLearn('secret', crypto.randomBytes(32).toString('hex'));
    const keys: [string, ...string[]] = [
      crypto.randomBytes(32).toString('hex'),
      crypto.randomBytes(32).toString('hex'),
    ];

    await withConfig({ databaseEncryptionKey: keys }, () => {
      assert.throws(
        () => decryptFromStorage(ciphertext),
        'Stored ciphertext could not be decrypted with any configured key',
      );
    });
  });
});
