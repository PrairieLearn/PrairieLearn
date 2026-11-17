import he from 'he';

/**
 * Normalize an IMS/Canvas file reference to the on-disk filename: strip any
 * `?query`/`#fragment`, then URL- and HTML-decode.
 */
export function normalizeImsFilePath(rawPath: string): string {
  const pathWithoutQuery = rawPath.replace(/[?#].*$/, '');
  return he.decode(safeDecodeURIComponent(pathWithoutQuery));
}

export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
