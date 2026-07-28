export function b64EncodeUnicodeBrowser(str: string) {
  return btoa(String.fromCodePoint(...new TextEncoder().encode(str)));
}

export function b64DecodeUnicodeBrowser(str: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(str), (c) => c.charCodeAt(0)));
}

export function b64EncodeUnicodeNode(str: string) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

export function b64DecodeUnicodeNode(str: string) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

/**
 * Encodes a Unicode string into a Base64-encoded string.
 */
export function b64EncodeUnicode(str: string) {
  if (typeof Buffer !== 'undefined') {
    return b64EncodeUnicodeNode(str);
  }

  return b64EncodeUnicodeBrowser(str);
}

/**
 * Decodes a Base64-encoded string into a Unicode string.
 */
export function b64DecodeUnicode(str: string) {
  if (typeof Buffer !== 'undefined') {
    return b64DecodeUnicodeNode(str);
  }

  return b64DecodeUnicodeBrowser(str);
}
