import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const FORMAT_PREFIX = 'plenc:v1';

export type StorageKeyRing = string | readonly [string, ...string[]];
export type StorageWriteFormat = 'legacy' | 'v1';

export interface LegacyCiphertextFormat {
  name: string;
  encrypt(plaintext: string, key: string): string;
  decrypt(ciphertext: string, key: string): string;
}

export interface CiphertextMetadata {
  format: string;
  keyId: string;
  needsRotation: boolean;
}

export interface RotatedCiphertext {
  ciphertext: string;
  previous: CiphertextMetadata;
  rotated: boolean;
}

interface StorageKey {
  id: string;
  encoded: string;
  bytes: Buffer;
}

interface DecryptionResult extends CiphertextMetadata {
  plaintext: string;
}

export interface StorageCipher {
  readonly writeFormat: StorageWriteFormat;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  inspect(ciphertext: string): CiphertextMetadata;
  rotate(ciphertext: string): RotatedCiphertext;
}

function decodeKey(key: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('Storage encryption keys must be 32-byte hex strings');
  }
  return Buffer.from(key, 'hex');
}

export function getStorageKeyId(key: string): string {
  return crypto
    .createHash('sha256')
    .update(decodeKey(key))
    .digest()
    .subarray(0, 16)
    .toString('base64url');
}

function normalizeKeys(keyRing: StorageKeyRing): [StorageKey, ...StorageKey[]] {
  const encodedKeys = typeof keyRing === 'string' ? [keyRing] : keyRing;
  if (encodedKeys.length === 0) {
    throw new Error('Storage encryption key ring must contain at least one key');
  }

  const keys: StorageKey[] = [];
  for (const encoded of encodedKeys) {
    const key = {
      id: getStorageKeyId(encoded),
      encoded,
      bytes: decodeKey(encoded),
    };
    const existing = keys.find((candidate) => candidate.id === key.id);
    if (!existing) {
      keys.push(key);
    } else if (!crypto.timingSafeEqual(existing.bytes, key.bytes)) {
      throw new Error('Storage encryption keys have conflicting key identifiers');
    }
  }
  return keys as [StorageKey, ...StorageKey[]];
}

function encryptCurrent(plaintext: string, key: StorageKey): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key.bytes, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, encrypted, authTag]).toString('base64url');
  return `${FORMAT_PREFIX}:${key.id}:${payload}`;
}

function parseCurrentCiphertext(ciphertext: string): { keyId: string; payload: Buffer } | null {
  if (!ciphertext.startsWith('plenc:')) return null;

  const parts = ciphertext.split(':');
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== FORMAT_PREFIX) {
    throw new Error('Stored ciphertext uses an unsupported encrypted storage format');
  }

  const keyId = parts[2];
  const encodedPayload = parts[3];
  if (!keyId || !encodedPayload || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)) {
    throw new Error('Stored ciphertext has a malformed encrypted storage envelope');
  }

  const payload = Buffer.from(encodedPayload, 'base64url');
  if (
    payload.length < IV_LENGTH + AUTH_TAG_LENGTH ||
    payload.toString('base64url') !== encodedPayload
  ) {
    throw new Error('Stored ciphertext has a malformed encrypted storage envelope');
  }
  return { keyId, payload };
}

function decryptCurrent(payload: Buffer, key: StorageKey): string {
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH, payload.length - AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key.bytes, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

export function createStorageCipher({
  keyRing,
  legacyFormat,
  writeFormat,
}: {
  keyRing: StorageKeyRing;
  legacyFormat?: LegacyCiphertextFormat;
  writeFormat?: StorageWriteFormat;
}): StorageCipher {
  const resolvedWriteFormat = writeFormat ?? (legacyFormat ? 'legacy' : 'v1');
  if (resolvedWriteFormat === 'legacy' && !legacyFormat) {
    throw new Error('A legacy ciphertext format is required for legacy writes');
  }

  const keys = normalizeKeys(keyRing);
  const primaryKey = keys[0];
  const keysById = new Map(keys.map((key) => [key.id, key]));

  function decryptWithMetadata(ciphertext: string): DecryptionResult {
    const envelope = parseCurrentCiphertext(ciphertext);
    if (envelope) {
      const key = keysById.get(envelope.keyId);
      if (!key) {
        throw new Error('Stored ciphertext references an unconfigured encryption key');
      }
      try {
        return {
          plaintext: decryptCurrent(envelope.payload, key),
          format: 'v1',
          keyId: key.id,
          needsRotation: key.id !== primaryKey.id,
        };
      } catch (cause) {
        throw new Error('Stored ciphertext failed authentication', { cause });
      }
    }

    let lastError: unknown;
    if (legacyFormat) {
      for (const key of keys) {
        try {
          return {
            plaintext: legacyFormat.decrypt(ciphertext, key.encoded),
            format: legacyFormat.name,
            keyId: key.id,
            needsRotation: true,
          };
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw new Error('Stored ciphertext could not be decrypted with any configured key', {
      cause: lastError,
    });
  }

  return {
    writeFormat: resolvedWriteFormat,
    encrypt(plaintext) {
      if (resolvedWriteFormat === 'legacy') {
        return legacyFormat!.encrypt(plaintext, primaryKey.encoded);
      }
      return encryptCurrent(plaintext, primaryKey);
    },
    decrypt(ciphertext) {
      return decryptWithMetadata(ciphertext).plaintext;
    },
    inspect(ciphertext) {
      const { plaintext: _plaintext, ...metadata } = decryptWithMetadata(ciphertext);
      return metadata;
    },
    rotate(ciphertext) {
      if (resolvedWriteFormat !== 'v1') {
        throw new Error('Ciphertext rotation requires the cipher to use v1 writes');
      }
      const result = decryptWithMetadata(ciphertext);
      const previous = {
        format: result.format,
        keyId: result.keyId,
        needsRotation: result.needsRotation,
      };
      if (!result.needsRotation) {
        return { ciphertext, previous, rotated: false };
      }

      const replacement = encryptCurrent(result.plaintext, primaryKey);
      if (decryptWithMetadata(replacement).plaintext !== result.plaintext) {
        throw new Error('Rotated ciphertext failed verification');
      }
      return { ciphertext: replacement, previous, rotated: true };
    },
  };
}
