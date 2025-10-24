//

/**
 * @internal
 */
export function b64EncodeUnicodeBrowser(str: string) {
  // (1) use encodeURIComponent to get percent-encoded UTF-8
  // (2) convert percent encodings to raw bytes
  // (3) convert raw bytes to Base64
  return btoa(
    encodeURIComponent(str).replaceAll(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(Number.parseInt('0x' + p1, 16));
    }),
  );
}

export function b64DecodeUnicodeBrowser(str: string) {
  // Going backwards: from bytestream, to percent-encoding, to original string.
  return decodeURIComponent(
    atob(str)
      .split('')
      .map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join(''),
  );
}

export function b64EncodeUnicodeNode(str: string) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

export function b64DecodeUnicodeNode(str: string) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

export function b64EncodeUnicode(str: string) {
  if (typeof Buffer !== 'undefined') {
    return b64EncodeUnicodeNode(str);
  }

  return b64EncodeUnicodeBrowser(str);
}

export function b64DecodeUnicode(str: string) {
  if (typeof Buffer !== 'undefined') {
    return b64DecodeUnicodeNode(str);
  }

  return b64DecodeUnicodeBrowser(str);
}
