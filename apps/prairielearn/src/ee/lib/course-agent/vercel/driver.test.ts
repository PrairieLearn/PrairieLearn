import { randomUUID } from 'node:crypto';

import { beforeEach, expect, it, vi } from 'vitest';

import {
  CourseAgentSnapshotSchema,
  CourseAgentStartRunRequestSchema,
} from '@prairielearn/course-agent-protocol';

import { createDriver } from './driver.js';
import type { State } from './state.js';

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  createSession: vi.fn(),
  stream: vi.fn(),
  continueStream: vi.fn(),
}));
vi.mock('@vercel/sandbox', () => ({ Sandbox: { getOrCreate: mock.create, get: mock.get } }));
vi.mock('@ai-sdk/sandbox-vercel', () => ({ createVercelSandbox: vi.fn() }));
vi.mock('@ai-sdk/harness-codex', () => ({ createCodex: vi.fn() }));
vi.mock('@ai-sdk/harness/agent', () => ({
  HarnessAgent: class {
    createSession = mock.createSession;
    stream = mock.stream;
    continueStream = mock.continueStream;
  },
}));

beforeEach(() => vi.resetAllMocks());

it('uses native SDK chunks, hides tool internals, and continues a saved publication tool', async () => {
  const sandbox = {
    update: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue({ snapshot: { id: 'snapshot-1' } }),
  };
  mock.create.mockResolvedValue(sandbox);
  const resume = {
    type: 'resume-session',
    harnessId: 'codex',
    specificationVersion: 'harness-v1',
    data: {},
  };
  const session = { detach: vi.fn().mockResolvedValue(resume) };
  mock.createSession.mockResolvedValue(session);
  const stream = new ReadableStream({
    start(controller) {
      for (const part of [
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', text: 'Ready' },
        { type: 'text-end', id: 'text' },
        { type: 'reasoning-start', id: 'reasoning' },
        { type: 'reasoning-delta', id: 'reasoning', text: 'private reasoning' },
        { type: 'reasoning-end', id: 'reasoning' },
        {
          type: 'tool-call',
          toolCallId: 'read',
          toolName: 'shell',
          input: { command: 'private command' },
        },
        { type: 'tool-result', toolCallId: 'read', toolName: 'shell', output: 'private stdout' },
        { type: 'tool-call', toolCallId: 'publish', toolName: 'push_sync', input: {} },
      ]) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
  mock.stream.mockResolvedValue({ stream });
  const request = CourseAgentStartRunRequestSchema.parse({
    conversationId: randomUUID(),
    runId: randomUUID(),
    sandboxId: 'test-sandbox',
    prompt: 'Create a question',
    course: {
      repository: 'https://github.com/PrairieLearn/test-course.git',
      branch: 'master',
      expectedSha: null,
    },
    authoringContext: { courseInstance: null },
    runtimeSettings: {},
  });
  const state: State = {
    userId: '1',
    courseId: '2',
    request,
    resume: null,
    pendingToolId: null,
    continuationDelivered: null,
    snapshot: CourseAgentSnapshotSchema.parse({
      conversationId: request.conversationId,
      sandboxId: request.sandboxId,
      activeRunId: request.runId,
      status: 'starting',
      response: null,
      error: null,
      events: [],
    }),
  };
  const factory = createDriver({
    token: 'test-vercel-token',
    teamId: 'team',
    projectId: 'project',
    openaiKey: 'test-openai-key',
    githubToken: 'test-read-token',
    model: 'test-model',
    timeoutMs: 60_000,
  });
  const driver = await factory(state);
  const parts = [];
  for await (const part of driver.stream({ prompt: request.prompt })) parts.push(part);
  expect(parts).toContainEqual({
    type: 'chunk',
    chunk: {
      type: 'tool-input-available',
      toolCallId: 'read',
      toolName: 'activity',
      input: { label: 'shell' },
      providerExecuted: true,
    },
  });
  expect(parts.at(-1)).toEqual({ type: 'publish', id: 'publish' });
  expect(JSON.stringify(parts)).not.toContain('private');
  const checkpoint = await driver.checkpoint();
  expect(checkpoint).toEqual({ resume, snapshotId: 'snapshot-1' });
  state.resume = checkpoint.resume;
  state.snapshot.workspaceBackup = {
    handle: { id: checkpoint.snapshotId, dir: '/vercel/sandbox' },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  mock.get.mockResolvedValue({ currentSnapshotId: 'snapshot-1' });
  const restored = await factory(state);
  expect(mock.createSession).toHaveBeenLastCalledWith({
    sessionId: request.conversationId,
    resumeFrom: checkpoint.resume,
  });
  expect(sandbox.stop).toHaveBeenCalledOnce();
  mock.continueStream.mockResolvedValue({
    stream: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
  });
  for await (const part of restored.stream({
    toolCallId: 'publish',
    output: { published: true },
  })) {
    parts.push(part);
  }
  expect(mock.continueStream).toHaveBeenCalledWith(
    expect.objectContaining({
      toolResultContinuations: [
        {
          type: 'tool-result',
          toolName: 'push_sync',
          toolCallId: 'publish',
          output: { type: 'text', value: '{"published":true}' },
        },
      ],
    }),
  );
});
