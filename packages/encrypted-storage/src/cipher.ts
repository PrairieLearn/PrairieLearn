export type StorageKeyRing = string | readonly [string, ...string[]];

export interface StorageCiphertextFormat {
  encrypt(plaintext: string, key: string): string;
  decrypt(ciphertext: string, key: string): string;
}

export interface StorageCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  needsRotation(ciphertext: string): boolean;
  rotate(ciphertext: string): string | null;
}

function normalizeKeys(keyRing: StorageKeyRing): [string, ...string[]] {
  const encodedKeys = typeof keyRing === 'string' ? [keyRing] : keyRing;
  if (encodedKeys.length === 0) {
    throw new Error('Storage encryption key ring must contain at least one key');
  }

  const keys: string[] = [];
  for (const encoded of encodedKeys) {
    if (!/^[0-9a-f]{64}$/i.test(encoded)) {
      throw new Error('Storage encryption keys must be 32-byte hex strings');
    }
    const normalized = encoded.toLowerCase();
    if (!keys.includes(normalized)) keys.push(normalized);
  }
  return keys as [string, ...string[]];
}

export function createStorageCipher({
  keyRing,
  format,
}: {
  keyRing: StorageKeyRing;
  format: StorageCiphertextFormat;
}): StorageCipher {
  const keys = normalizeKeys(keyRing);
  const primaryKey = keys[0];

  function decryptWithKeyIndex(ciphertext: string) {
    let lastError: unknown;
    for (const [keyIndex, key] of keys.entries()) {
      try {
        return { plaintext: format.decrypt(ciphertext, key), keyIndex };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error('Stored ciphertext could not be decrypted with any configured key', {
      cause: lastError,
    });
  }

  return {
    encrypt(plaintext) {
      return format.encrypt(plaintext, primaryKey);
    },
    decrypt(ciphertext) {
      return decryptWithKeyIndex(ciphertext).plaintext;
    },
    needsRotation(ciphertext) {
      return decryptWithKeyIndex(ciphertext).keyIndex !== 0;
    },
    rotate(ciphertext) {
      const result = decryptWithKeyIndex(ciphertext);
      if (result.keyIndex === 0) return null;

      const replacement = format.encrypt(result.plaintext, primaryKey);
      if (format.decrypt(replacement, primaryKey) !== result.plaintext) {
        throw new Error('Rotated ciphertext failed verification');
      }
      return replacement;
    },
  };
}
