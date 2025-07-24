/**
 * This module is used to track whether the server has been initialized.
 *
 * Since vite won't reload this file in HMR mode, this will work.
 */
console.log('re-importing server-initialized');
let serverState: 'started' | 'pending' | 'stopped' = 'stopped';

export function isServerInitialized() {
  console.log('isServerInitialized', serverState);
  return serverState === 'started';
}

export function isServerPending() {
  console.log('isServerPending', serverState);
  return serverState === 'pending';
}

export function setServerState(state: 'started' | 'pending' | 'stopped') {
  console.log('setServerState', state);
  serverState = state;
}
