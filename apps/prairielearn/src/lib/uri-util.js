//@ts-check
import { logger } from '@prairielearn/logger';
import * as path from 'path';

export function encodePath(originalPath) {
  try {
    let encodedPath = [];
    path
      .normalize(originalPath)
      .split(path.sep)
      .forEach((dir) => {
        encodedPath.push(encodeURIComponent(dir));
      });
    return encodedPath.join('/');
  } catch (err) {
    logger.error(`encodePath: returning empty string because failed to encode ${originalPath}`);
    return '';
  }
}

export function decodePath(originalPath) {
  try {
    let decodedPath = [];
    originalPath.split(path.sep).forEach((dir) => {
      decodedPath.push(decodeURIComponent(dir));
    });
    return decodedPath.join('/');
  } catch (err) {
    logger.error(`decodePath: returning empty string because failed to decode ${originalPath}`);
    return '';
  }
}
