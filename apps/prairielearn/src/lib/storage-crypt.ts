import { config } from './config.js';
import { type KeyRing, getActiveKey, tryWithKeyRing } from './key-ring.js';
import { decrypt, encrypt } from './symmetric-crypto.js';

function encryptForStorageWithKeyRing(plaintext: string, keyRing: KeyRing): string {
  return encrypt(plaintext, getActiveKey(keyRing));
}

function decryptFromStorageWithKeyRing(ciphertext: string, keyRing: KeyRing): string {
  try {
    return tryWithKeyRing(keyRing, (key) => decrypt(ciphertext, key));
  } catch (cause) {
    throw new Error('Stored ciphertext could not be decrypted with any configured key', { cause });
  }
}

/**
 * Encrypt plaintext for storage (in the database or elsewhere).
 *
 * @param plaintext The plaintext to encrypt (utf8).
 * @returns The ciphertext (utf8).
 */
export function encryptForStorage(plaintext: string): string {
  return encryptForStorageWithKeyRing(plaintext, config.databaseEncryptionKey);
}

/**
 * Decrypt ciphertext from storage (in the database or elsewhere).
 *
 * @param ciphertext The ciphertext to decrypt (utf8).
 * @returns The plaintext (utf8).
 */
export function decryptFromStorage(ciphertext: string): string {
  return decryptFromStorageWithKeyRing(ciphertext, config.databaseEncryptionKey);
}
