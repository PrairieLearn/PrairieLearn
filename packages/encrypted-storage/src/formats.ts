import * as crypto from 'node:crypto';

import type { StorageCiphertextFormat } from './cipher.js';

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

/** PrairieLearn format: base64(12-byte IV + ciphertext + 16-byte authentication tag). */
export const prairieLearnCiphertextFormat: StorageCiphertextFormat = {
  encrypt(plaintext, key) {
    const { encrypted, iv, authTag } = encryptAesGcm(plaintext, key, 12);
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  },
  decrypt(ciphertext, key) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(ciphertext)) throw new Error('Invalid base64 ciphertext');
    const data = Buffer.from(ciphertext, 'base64');
    if (data.toString('base64') !== ciphertext || data.length < 28) {
      throw new Error('Invalid PrairieLearn ciphertext');
    }
    return decryptAesGcm({
      encrypted: data.subarray(12, data.length - AUTH_TAG_LENGTH),
      iv: data.subarray(0, 12),
      authTag: data.subarray(data.length - AUTH_TAG_LENGTH),
      key,
    });
  },
};

/** PrairieTest format: hex(ciphertext):hex(16-byte IV):hex(16-byte authentication tag). */
export const prairieTestCiphertextFormat: StorageCiphertextFormat = {
  encrypt(plaintext, key) {
    const { encrypted, iv, authTag } = encryptAesGcm(plaintext, key, 16);
    return `${encrypted.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}`;
  },
  decrypt(ciphertext, key) {
    const parts = ciphertext.split(':');
    if (parts.length !== 3 || parts.some((part) => !/^[0-9a-f]*$/i.test(part))) {
      throw new Error('Invalid PrairieTest ciphertext');
    }
    const [encryptedHex, ivHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 16 || iv.toString('hex') !== ivHex.toLowerCase()) {
      throw new Error('Invalid PrairieTest initialization vector');
    }
    const authTag = Buffer.from(authTagHex, 'hex');
    if (authTag.toString('hex') !== authTagHex.toLowerCase()) {
      throw new Error('Invalid PrairieTest authentication tag');
    }
    const encrypted = Buffer.from(encryptedHex, 'hex');
    if (encrypted.toString('hex') !== encryptedHex.toLowerCase()) {
      throw new Error('Invalid PrairieTest ciphertext');
    }
    return decryptAesGcm({ encrypted, iv, authTag, key });
  },
};
