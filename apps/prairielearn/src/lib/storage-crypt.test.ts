import * as crypto from 'node:crypto';

import { assert, describe, it } from 'vitest';

import { decryptFromStorage, encryptForStorage } from './storage-crypt.js';
import { decrypt, encrypt } from './symmetric-crypto.js';

describe('symmetric-crypto', () => {
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

  it('decrypting with wrong key throws', () => {
    const keyA = crypto.randomBytes(32).toString('hex');
    const keyB = crypto.randomBytes(32).toString('hex');
    const ciphertext = encrypt('secret', keyA);
    assert.throws(() => decrypt(ciphertext, keyB));
  });

  it('tampered ciphertext throws', () => {
    const key = crypto.randomBytes(32).toString('hex');
    const ciphertext = encrypt('secret', key);
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    assert.throws(() => decrypt(tampered, key));
  });

  it('empty string round-trips', () => {
    const ciphertext = encryptForStorage('');
    assert.equal(decryptFromStorage(ciphertext), '');
  });
});
