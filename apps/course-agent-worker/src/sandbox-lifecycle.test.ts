import { describe, expect, it } from 'vitest';

import {
  SANDBOX_DESTRUCTION_REASONS,
  courseAgentSandboxOptions,
  destroySandboxForLifecycle,
  selectWorkspacePreparation,
} from './sandbox-lifecycle.js';

describe('sandbox lifecycle', () => {
  it('disables the Sandbox SDK automatic inactivity shutdown', () => {
    expect(courseAgentSandboxOptions('sandbox-id').keepAlive).toBe(true);
  });

  it('allows destruction only for preemption and explicit kill reasons', () => {
    expect(SANDBOX_DESTRUCTION_REASONS).toEqual([
      'idle_timeout',
      'test_kill',
      'conversation_deleted',
    ]);
  });

  it('reuses a live checkout before considering restore or clone', () => {
    expect(selectWorkspacePreparation({ courseCheckoutExists: true, backupAvailable: false })).toBe(
      'reuse',
    );
    expect(selectWorkspacePreparation({ courseCheckoutExists: true, backupAvailable: true })).toBe(
      'reuse',
    );
    expect(selectWorkspacePreparation({ courseCheckoutExists: false, backupAvailable: true })).toBe(
      'restore',
    );
    expect(
      selectWorkspacePreparation({ courseCheckoutExists: false, backupAvailable: false }),
    ).toBe('clone');
  });

  it.each(SANDBOX_DESTRUCTION_REASONS)(
    'checkpoints immediately before destroying for %s',
    async (reason) => {
      const calls: string[] = [];

      await destroySandboxForLifecycle({
        reason,
        sandbox: {
          destroy: async () => {
            calls.push('destroy');
          },
        },
        checkpoint: async () => {
          calls.push('checkpoint');
        },
        emit: async (event) => {
          calls.push(event);
        },
      });

      expect(calls).toEqual(['checkpoint', 'sandbox.destroying', 'destroy', 'sandbox.destroyed']);
    },
  );
});
