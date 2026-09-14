import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Chat } from '@ai-sdk/react';
import { afterEach, expect, it, vi } from 'vitest';

import { withConfig } from '../../../tests/utils/config.js';
import { createCourseAgentTransport } from '../../components/courseAgentTransport.js';

import {
  respondToCourseAgentPushApproval,
  startEphemeralCourseAgentRun,
} from './ephemeral-runtime.js';
import type { CourseAgentMessage } from './ui-stream.js';
import type { DriverSession } from './vercel/driver.js';
import { Runtime } from './vercel/runtime.js';
import { StateStore } from './vercel/state.js';

const mock = vi.hoisted(() => ({ runtime: vi.fn(), relay: vi.fn(), persist: vi.fn() }));
vi.mock('./vercel/index.js', () => ({ getVercelCourseAgentRuntime: mock.runtime }));
vi.mock('./redis.js', () => ({
  getCourseAgentStreamContext: async () => ({ createNewResumableStream: mock.relay }),
  getCourseAgentStreamId: () => 'stream',
}));
vi.mock('../../../models/course-agent.js', () => ({ persistCourseAgentSnapshot: mock.persist }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it('connects useChat to the in-process runtime and resumes an approval after runtime replacement', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pl-vercel-flow-'));
  const store = new StateStore(directory);
  const session: DriverSession = {
    async *stream(input) {
      const id = randomUUID();
      yield { type: 'chunk', chunk: { type: 'text-start', id } };
      yield {
        type: 'chunk',
        chunk: {
          type: 'text-delta',
          id,
          delta: 'prompt' in input ? 'Please review the question.' : 'Published and synced.',
        },
      };
      yield { type: 'chunk', chunk: { type: 'text-end', id } };
      if ('prompt' in input) yield { type: 'publish', id: 'push-tool' };
    },
    proposal: async () => ({
      baseSha: 'a'.repeat(40),
      proposedSha: 'b'.repeat(40),
      treeSha: 'c'.repeat(40),
      branch: 'master',
      commitMessage: 'Add question',
      diff: 'diff --git a/question b/question\n',
      diffSummary: '1 file changed',
    }),
    refresh: vi.fn().mockResolvedValue(undefined),
    checkpoint: async () => ({
      resume: {
        type: 'resume-session',
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: {},
      },
      snapshotId: 'snapshot',
    }),
    interrupt: vi.fn().mockResolvedValue(undefined),
  };
  const driver = vi.fn(async () => session);
  let runtime = new Runtime(store, driver);
  await runtime.initialize();
  mock.runtime.mockImplementation(async () => runtime);
  let relay!: ReadableStream<string>;
  mock.relay.mockImplementation((_id: string, factory: () => ReadableStream<string>) => {
    relay = factory();
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(relay.pipeThrough(new TextEncoderStream()))),
  );
  const conversationId = randomUUID();
  const identity = {
    conversationId,
    sandboxId: `course-agent-${conversationId}`,
    userId: '1',
    courseId: '2',
  };
  try {
    await withConfig({ courseAgentRuntime: 'vercel' }, async () => {
      const start = vi.fn(async ({ prompt }: { prompt: string }) =>
        startEphemeralCourseAgentRun({
          ...identity,
          prompt,
          authoringContext: { courseInstance: null },
          course: {
            repository: 'https://github.com/PrairieLearn/test-course.git',
            branch: 'master',
            expectedSha: null,
          },
        }),
      );
      const chat = new Chat<CourseAgentMessage>({
        transport: createCourseAgentTransport(start, '2', null, vi.fn()),
      });
      const sending = chat.sendMessage({ text: 'Create one practice question.' });
      await vi.waitFor(() => expect(driver).toHaveBeenCalledOnce());
      await runtime.settled(conversationId);
      const pending = runtime.snapshot(identity).pendingApproval!;
      await vi.waitFor(() =>
        expect(chat.messages.at(-1)?.parts).toContainEqual(
          expect.objectContaining({ type: 'text', text: 'Please review the question.' }),
        ),
      );
      runtime = new Runtime(store, driver);
      await runtime.initialize();
      await respondToCourseAgentPushApproval({
        ...identity,
        approvalId: pending.id,
        decision: 'completed',
        result: { published: true, commitSha: 'd'.repeat(40) },
      });
      await sending;
      expect(chat.status).toBe('ready');
      expect(chat.messages).toHaveLength(2);
      expect(chat.messages.at(-1)?.parts).toContainEqual(
        expect.objectContaining({ type: 'text', text: 'Published and synced.' }),
      );
      expect(chat.messages.at(-1)?.parts).toContainEqual(
        expect.objectContaining({ type: 'data-courseSynced' }),
      );
      expect(start).toHaveBeenCalledOnce();
      expect(session.refresh).toHaveBeenCalledOnce();
      expect(mock.persist).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({ activeRunId: null, status: 'waiting_for_user' }),
        }),
      );
    });
  } finally {
    await runtime.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});
