export function b64EncodeUnicodeBrowser(str: string) {
  const bytes = new TextEncoder().encode(str);
  let binaryString = '';
  const CHUNK_SIZE = 0x8000;

  // Call String.fromCodePoint in chunks to avoid stack overflow for large strings.
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binaryString += String.fromCodePoint(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binaryString);
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
