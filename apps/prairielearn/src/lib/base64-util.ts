export function b64EncodeUnicode(str: string) {
  // (1) use encodeURIComponent to get percent-encoded UTF-8
  // (2) convert percent encodings to raw bytes
  // (3) convert raw bytes to Base64
  return btoa(
    encodeURIComponent(str).replaceAll(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(Number.parseInt('0x' + p1, 16));
    }),
  );
}

export function b64DecodeUnicode(str: string) {
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
