// @ts-check
import * as path from 'path';

import { logger } from '@prairielearn/logger';

/**
 *
 * @param {string} originalPath
 * @returns {string}
 */
export function encodePath(originalPath) {
  try {
    return path.normalize(originalPath).split(path.sep).map(encodeURIComponent).join('/');
  } catch (err) {
    logger.error(`encodePath: returning empty string because failed to encode ${originalPath}`);
    return '';
  }
}
