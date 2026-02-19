import { config } from './config.js';
import { decrypt, encrypt } from './symmetric-crypto.js';

/**
 * Encrypt plaintext for storage (in the database or elsewhere).
 *
 * @param plaintext The plaintext to encrypt (utf8).
 * @returns The ciphertext (utf8).
 */
export async function encryptForStorage(plaintext: string): Promise<string> {
  return await encrypt(plaintext, config.databaseEncryptionKey);
}

/**
 * Decrypt ciphertext from storage (in the database or elsewhere).
 *
 * @param ciphertext The ciphertext to decrypt (utf8).
 * @returns The plaintext (utf8).
 */
export function decryptFromStorage(ciphertext: string): string {
  return decrypt(ciphertext, config.databaseEncryptionKey);
}
