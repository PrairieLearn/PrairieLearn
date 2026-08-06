import * as crypto from 'node:crypto';

import type { LegacyCiphertextFormat } from './cipher.js';

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;

function decodeKey(key: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('Storage encryption keys must be 32-byte hex strings');
  }
  return Buffer.from(key, 'hex');
}

function decryptAesGcm({
  encrypted,
  iv,
  authTag,
  key,
}: {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
  key: string;
}): string {
  if (authTag.length !== AUTH_TAG_LENGTH) throw new Error('Invalid authentication tag');
  const decipher = crypto.createDecipheriv(ALGORITHM, decodeKey(key), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

function encryptAesGcm(plaintext: string, key: string, ivLength: number) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(ALGORITHM, decodeKey(key), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { encrypted, iv, authTag: cipher.getAuthTag() };
}

export function encryptLegacyPrairieLearn(plaintext: string, key: string): string {
  const { encrypted, iv, authTag } = encryptAesGcm(plaintext, key, 12);
  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

/** Legacy PrairieLearn format: base64(12-byte IV + ciphertext + 16-byte authentication tag). */
export const legacyPrairieLearnFormat: LegacyCiphertextFormat = {
  name: 'prairielearn-v0',
  encrypt: encryptLegacyPrairieLearn,
  decrypt(ciphertext, key) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(ciphertext)) throw new Error('Invalid base64 ciphertext');
    const data = Buffer.from(ciphertext, 'base64');
    if (data.toString('base64') !== ciphertext || data.length < 28) {
      throw new Error('Invalid PrairieLearn legacy ciphertext');
    }
    return decryptAesGcm({
      encrypted: data.subarray(12, data.length - AUTH_TAG_LENGTH),
      iv: data.subarray(0, 12),
      authTag: data.subarray(data.length - AUTH_TAG_LENGTH),
      key,
    });
  },
};

export function encryptLegacyPrairieTest(plaintext: string, key: string): string {
  const { encrypted, iv, authTag } = encryptAesGcm(plaintext, key, 16);
  return `${encrypted.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}`;
}

/** Legacy PrairieTest format: hex(ciphertext):hex(16-byte IV):hex(16-byte authentication tag). */
export const legacyPrairieTestFormat: LegacyCiphertextFormat = {
  name: 'prairietest-v0',
  encrypt: encryptLegacyPrairieTest,
  decrypt(ciphertext, key) {
    const parts = ciphertext.split(':');
    if (parts.length !== 3 || parts.some((part) => !/^[0-9a-f]*$/i.test(part))) {
      throw new Error('Invalid PrairieTest legacy ciphertext');
    }
    const [encryptedHex, ivHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 16 || iv.toString('hex') !== ivHex.toLowerCase()) {
      throw new Error('Invalid PrairieTest legacy initialization vector');
    }
    const authTag = Buffer.from(authTagHex, 'hex');
    if (authTag.toString('hex') !== authTagHex.toLowerCase()) {
      throw new Error('Invalid PrairieTest legacy authentication tag');
    }
    const encrypted = Buffer.from(encryptedHex, 'hex');
    if (encrypted.toString('hex') !== encryptedHex.toLowerCase()) {
      throw new Error('Invalid PrairieTest legacy ciphertext');
    }
    return decryptAesGcm({ encrypted, iv, authTag, key });
  },
};
