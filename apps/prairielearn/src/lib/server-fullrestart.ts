/**
 * This module is used to track whether the server needs to be fully restarted.
 *
 * Vite will reload this file whenever any of the imports change.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as codeCaller from './code-caller/index.js';

let fullRestart = true;

export function setNeedsFullRestart(state: boolean) {
  fullRestart = state;
}

export function needsFullRestart() {
  return fullRestart;
}
