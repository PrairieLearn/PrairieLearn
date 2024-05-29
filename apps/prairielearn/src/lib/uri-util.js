// @ts-check
import * as path from 'path';

import { logger } from '@prairielearn/logger';

/**
 * Encodes a path for use in a URL. This is a middle-ground between `encodeURI`
 * and `encodeURIComponent`, in that all characters encoded by
 * `encodeURIComponent` are encoded, but slashes are not encoded.
 *
 * @param {string} originalPath path of the file that is the basis for the encoding
 * @returns {string} Encoded path
 */
export function encodePath(originalPath) {
  try {
    return path.normalize(originalPath).split(path.sep).map(encodeURIComponent).join('/');
  } catch (err) {
    logger.error(`encodePath: returning empty string because failed to encode ${originalPath}`);
    return '';
  }
}
