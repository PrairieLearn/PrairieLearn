/**
 * This module is used to track whether the server has been initialized.
 *
 * This file serves as external state for 'server.ts', and the server may
 * perform unexpectedly if this file is modified while the server is running.
 */

type ServerState = 'stopped' | 'pending' | 'initialized';

let serverState: ServerState = 'stopped';

export function isServerInitialized() {
  return serverState === 'initialized';
}

export function isServerPending() {
  return serverState === 'pending';
}

export function setServerState(state: ServerState) {
  serverState = state;
}
