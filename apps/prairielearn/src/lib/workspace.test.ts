import { afterEach, assert, describe, it } from 'vitest';

import { config } from './config.js';
import { canLaunchAdditionalHosts, decideStartupAction } from './workspace.js';

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

describe('canLaunchAdditionalHosts', () => {
  const originalAutoscalingEnabled = config.workspaceAutoscalingEnabled;
  const originalLaunchTemplateId = config.workspaceLoadLaunchTemplateId;

  afterEach(() => {
    config.workspaceAutoscalingEnabled = originalAutoscalingEnabled;
    config.workspaceLoadLaunchTemplateId = originalLaunchTemplateId;
  });

  it('can launch hosts when autoscaling is enabled and a launch template is configured', () => {
    config.workspaceAutoscalingEnabled = true;
    config.workspaceLoadLaunchTemplateId = 'lt-1234';
    assert.isTrue(canLaunchAdditionalHosts());
  });

  it('cannot launch hosts when no launch template is configured (e.g. local development)', () => {
    config.workspaceAutoscalingEnabled = true;
    config.workspaceLoadLaunchTemplateId = null;
    assert.isFalse(canLaunchAdditionalHosts());
  });

  it('cannot launch hosts when autoscaling is disabled', () => {
    config.workspaceAutoscalingEnabled = false;
    config.workspaceLoadLaunchTemplateId = 'lt-1234';
    assert.isFalse(canLaunchAdditionalHosts());
  });
});
