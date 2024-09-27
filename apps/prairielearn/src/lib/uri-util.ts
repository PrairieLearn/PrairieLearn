import * as path from 'path';

import { logger } from '@prairielearn/logger';

/**
 * Encodes a path for use in a URL. This is a middle-ground between `encodeURI`
 * and `encodeURIComponent`, in that all characters encoded by
 * `encodeURIComponent` are encoded, but slashes are not encoded.
 *
 * @param originalPath path of the file that is the basis for the encoding
 * @returns Encoded path
 */
export function encodePath(originalPath: string): string {
  try {
    return path.normalize(originalPath).split(path.sep).map(encodeURIComponent).join('/');
  } catch {
    logger.error(`encodePath: returning empty string because failed to encode ${originalPath}`);
    return '';
  }
}
