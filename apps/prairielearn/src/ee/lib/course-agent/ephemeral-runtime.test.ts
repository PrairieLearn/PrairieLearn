import { afterEach, assert, describe, expect, it, vi } from 'vitest';

import { withConfig } from '../../../tests/utils/config.js';

import {
  getEphemeralCourseAgentSnapshot,
  resetFakeCourseAgentRuntime,
  startEphemeralCourseAgentRun,
} from './ephemeral-runtime.js';

describe('ephemeral course-agent runtime', () => {
  afterEach(resetFakeCourseAgentRuntime);
  afterEach(() => vi.unstubAllGlobals());

  it('explains how to start the separately managed Worker when it is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await withConfig(
      {
        devMode: true,
        courseAgentRuntime: 'cloudflare',
        courseAgentCapabilitySecret: 'local-test-secret',
      },
      async () => {
        await expect(
          startEphemeralCourseAgentRun({ courseId: '1', userId: '2', prompt: 'Hello' }),
        ).rejects.toThrow('pnpm dev-course-agent-worker');
      },
    );
  });

  it('rejects Worker redirects without forwarding its capability', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await withConfig(
      {
        courseAgentRuntime: 'cloudflare',
        courseAgentCapabilitySecret: 'local-test-secret',
      },
      async () => {
        await expect(
          startEphemeralCourseAgentRun({ courseId: '1', userId: '2', prompt: 'Hello' }),
        ).rejects.toThrow('rejected the run');
      },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

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
        conversationId: first.conversationId.toUpperCase(),
        prompt: 'Update the same note',
      });
      const snapshot = await getEphemeralCourseAgentSnapshot({
        courseId: '1',
        userId: '2',
        conversationId: first.conversationId.toUpperCase(),
        sandboxId: 'untrusted-client-sandbox',
      });
      assert.equal(snapshot.status, 'waiting_for_user');
      assert.equal(snapshot.events.filter((event) => event.type === 'user.message').length, 2);
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

  it('rejects snapshot requests when the runtime is disabled', async () => {
    await withConfig({ courseAgentRuntime: 'disabled' }, async () => {
      await expect(() =>
        getEphemeralCourseAgentSnapshot({
          courseId: '1',
          userId: '2',
          conversationId: '9a6d8f44-d55b-4e73-8b9b-547dd00fb400',
          sandboxId: 'course-agent-test',
        }),
      ).rejects.toThrow('Course-agent runtime is disabled');
    });
  });
});
