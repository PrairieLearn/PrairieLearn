import { afterEach, assert, describe, expect, it } from 'vitest';

import { withConfig } from '../../../tests/utils/config.js';

import {
  getEphemeralCourseAgentSnapshot,
  resetFakeCourseAgentRuntime,
  startEphemeralCourseAgentRun,
} from './ephemeral-runtime.js';

describe('ephemeral course-agent runtime', () => {
  afterEach(resetFakeCourseAgentRuntime);

  it('reuses one fake workspace within a conversation and scopes access', async () => {
    await withConfig({ courseAgentRuntime: 'fake' }, async () => {
      const first = await startEphemeralCourseAgentRun({
        courseId: '1',
        userId: '2',
        prompt: 'Create a note',
      });
      await startEphemeralCourseAgentRun({
        courseId: '1',
        userId: '2',
        conversationId: first.conversationId,
        prompt: 'Update the same note',
      });
      const snapshot = await getEphemeralCourseAgentSnapshot({
        courseId: '1',
        userId: '2',
        conversationId: first.conversationId,
        sandboxId: first.sandboxId,
      });
      assert.equal(snapshot.status, 'waiting_for_user');
      assert.equal(snapshot.events.filter((event) => event.type === 'workspace.seeded').length, 1);
      await expect(() =>
        getEphemeralCourseAgentSnapshot({
          courseId: '1',
          userId: '3',
          conversationId: first.conversationId,
          sandboxId: first.sandboxId,
        }),
      ).rejects.toThrow('not found');
    });
  });
});
