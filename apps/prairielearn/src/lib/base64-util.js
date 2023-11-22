// @ts-check
import { logger } from '@prairielearn/logger';

const atob = (s) => String.fromCharCode(...Buffer.from(s, 'base64'));
const btoa = (s) => Buffer.from(s.split('').map((c) => c.charCodeAt(0))).toString('base64');

export function b64EncodeUnicode(str) {
  // (1) use encodeURIComponent to get percent-encoded UTF-8
  // (2) convert percent encodings to raw bytes
  // (3) convert raw bytes to Base64
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode(parseInt('0x' + p1, 16));
      }),
    );
  } catch (e) {
    logger.error(`b64EncodeUnicode: returning empty string because failed to encode ${str}`);
    return '';
  }
}

export function b64DecodeUnicode(str) {
  // Going backwards: from bytestream, to percent-encoding, to original string.
  try {
    return decodeURIComponent(
      atob(str)
        .split('')
        .map((c) => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(''),
    );
  } catch (e) {
    logger.error(`b64DecodeUnicode: returning empty string because failed to decode ${str}`);
    return '';
  }
}
