/**
 * This module is used to track whether the server has been initialized.
 *
 * Since vite won't reload this file in HMR mode, this will work.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as foo from './foo.js';

let fullRestart = true;

export function setNoFullRestart() {
  fullRestart = false;
}

export function isFullRestart() {
  return fullRestart;
}
