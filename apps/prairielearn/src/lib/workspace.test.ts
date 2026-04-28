import { assert, describe, it } from 'vitest';

import { decideStartupAction } from './workspace.js';

describe('decideStartupAction', () => {
  it('initializes and launches when uninit→uninit and the version still matches', () => {
    assert.equal(
      decideStartupAction({
        initialState: 'uninitialized',
        lockedState: 'uninitialized',
        initializeVersion: 1,
        lockedVersion: 1,
      }),
      'initialize-then-launch',
    );
  });

  it('bails when a reset incremented the version while initialize() was running', () => {
    assert.equal(
      decideStartupAction({
        initialState: 'uninitialized',
        lockedState: 'uninitialized',
        initializeVersion: 1,
        lockedVersion: 2,
      }),
      'bail',
    );
  });

  it('launches without re-initializing when another caller already finished init', () => {
    assert.equal(
      decideStartupAction({
        initialState: 'uninitialized',
        lockedState: 'stopped',
        initializeVersion: 1,
        lockedVersion: 1,
      }),
      'launch-only',
    );
  });

  it('is a noop when the workspace transitioned past stopped before we locked', () => {
    assert.equal(
      decideStartupAction({
        initialState: 'uninitialized',
        lockedState: 'launching',
        initializeVersion: 1,
        lockedVersion: 1,
      }),
      'noop',
    );
    assert.equal(
      decideStartupAction({
        initialState: 'uninitialized',
        lockedState: 'running',
        initializeVersion: 1,
        lockedVersion: 1,
      }),
      'noop',
    );
  });

  it('launches from a stopped initial state', () => {
    assert.equal(
      decideStartupAction({
        initialState: 'stopped',
        lockedState: 'stopped',
        initializeVersion: null,
        lockedVersion: 1,
      }),
      'launch-only',
    );
  });

  it('is a noop when a stopped workspace advanced past stopped before we locked', () => {
    assert.equal(
      decideStartupAction({
        initialState: 'stopped',
        lockedState: 'running',
        initializeVersion: null,
        lockedVersion: 1,
      }),
      'noop',
    );
  });
});
