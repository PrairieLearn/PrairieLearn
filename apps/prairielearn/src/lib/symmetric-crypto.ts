import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * @param plaintext The plaintext to encrypt (utf8).
 * @param key A 32-byte hex-encoded key.
 * @returns A base64 string containing IV + ciphertext + auth tag.
 */
export async function encrypt(plaintext: string, key: string): Promise<string> {
  const keyBuffer = Buffer.from(key, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

/**
 * Decrypt ciphertext that was encrypted with {@link encrypt}.
 *
 * @param ciphertext A base64 string containing IV + ciphertext + auth tag.
 * @param key A 32-byte hex-encoded key.
 * @returns The decrypted plaintext (utf8).
 */
export function decrypt(ciphertext: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'hex');
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}
