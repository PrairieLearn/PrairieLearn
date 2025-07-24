/**
 * This module is used to track whether the server has been initialized.
 *
 * This file serves as external state for 'server.ts', and the server may perform unexpectedly
 * if this file is modified while the server is running.
 */
let serverState: 'started' | 'pending' | 'stopped' = 'stopped';

export function isServerInitialized() {
  return serverState === 'started';
}

export function isServerPending() {
  return serverState === 'pending';
}

export function setServerState(state: 'started' | 'pending' | 'stopped') {
  serverState = state;
}
