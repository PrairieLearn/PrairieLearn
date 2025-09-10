/**
 * Encodes a path for use in a URL on the client. No path normalization is performed.
 * This is a middle-ground between `encodeURI` and `encodeURIComponent`, in that all characters encoded by
 * `encodeURIComponent` are encoded, but slashes are not encoded.
 *
 * @param originalPath path of the file that is the basis for the encoding
 * @returns Encoded path
 */
export function encodePathNoNormalize(originalPath: string): string {
  try {
    return originalPath.split('/').map(encodeURIComponent).join('/');
  } catch {
    return '';
  }
}
