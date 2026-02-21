import { assert, describe, it } from 'vitest';

import { decryptFromStorage, encryptForStorage } from './storage-crypt.js';

describe('symmetric-crypto', () => {
  it('can encrypt and decrypt a string', async () => {
    const plaintext = 'test message';
    const ciphertext = await encryptForStorage(plaintext);
    const decrypted = decryptFromStorage(ciphertext);
    assert.equal(decrypted, plaintext);
  });
});
