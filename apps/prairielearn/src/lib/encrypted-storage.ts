import {
  type StorageCipher,
  createStorageCipher,
  legacyPrairieLearnFormat,
} from '@prairielearn/encrypted-storage';

import { config } from './config.js';

export function getStorageCipher(): StorageCipher {
  return createStorageCipher({
    keyRing: config.databaseEncryptionKey,
    legacyFormat: legacyPrairieLearnFormat,
    writeFormat: config.databaseEncryptionWriteFormat,
  });
}

/**
 * Encrypt plaintext with the configured storage cipher.
 *
 * @param plaintext The plaintext to encrypt (utf8).
 * @returns The ciphertext (utf8).
 */
export function encryptForStorage(plaintext: string): string {
  return getStorageCipher().encrypt(plaintext);
}

/**
 * Decrypt ciphertext from storage (in the database or elsewhere).
 *
 * @param ciphertext The ciphertext to decrypt (utf8).
 * @returns The plaintext (utf8).
 */
export function decryptFromStorage(ciphertext: string): string {
  return getStorageCipher().decrypt(ciphertext);
}
