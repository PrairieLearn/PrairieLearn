/**
 * This module is used to track whether the server has been initialized.
 *
 * Since vite won't reload this file in HMR mode, this will work.
 */
console.log('re-importing server-initialized');
export let serverInitialized = false;

export function isServerInitialized() {
  console.log('isServerInitialized', serverInitialized);
  return serverInitialized;
}

export function setServerInitialized(state: boolean) {
  console.log('setServerInitialized', state);
  serverInitialized = state;
}
