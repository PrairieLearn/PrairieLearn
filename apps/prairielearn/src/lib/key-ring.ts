export type KeyRing = string | [string, ...string[]];

/**
 * Returns all keys in verification/decryption order.
 */
export function getKeyRing(keyRing: KeyRing): [string, ...string[]] {
  return typeof keyRing === 'string' ? [keyRing] : keyRing;
}

/**
 * Returns the key used for new signatures and ciphertext.
 */
export function getActiveKey(keyRing: KeyRing): string {
  return typeof keyRing === 'string' ? keyRing : keyRing[0];
}
