export type KeyRing = readonly [string, ...string[]];

/**
 * Returns the key used for new signatures and ciphertext.
 */
export function getActiveKey(keyRing: KeyRing): string {
  return keyRing[0];
}

/**
 * Returns the first successful result, or rethrows the last error if every key fails.
 */
export function tryWithKeyRing<T>(keyRing: KeyRing, fn: (key: string) => T): T {
  let lastError: unknown;
  for (const key of keyRing) {
    try {
      return fn(key);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
