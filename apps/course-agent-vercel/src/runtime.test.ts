import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

import { CourseAgentStartRunRequestSchema } from '@prairielearn/course-agent-protocol';

import type { DriverFactory, DriverSession, Part } from './driver.ts';
import { Runtime } from './runtime.ts';
import { StateStore } from './state.ts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
  directories.length = 0;
});

function request(conversationId: string = randomUUID()) {
  return CourseAgentStartRunRequestSchema.parse({
    capability: 'test',
    conversationId,
    runId: randomUUID(),
    sandboxId: `course-agent-${conversationId}`,
    prompt: 'Create a practice question.',
    course: {
      repository: 'https://github.com/PrairieLearn/test-course.git',
      branch: 'master',
      expectedSha: null,
    },
    authoringContext: { courseInstance: null },
    runtimeSettings: {},
  });
}

async function setup(parts: Part[] = [{ type: 'text', text: 'Created the question.' }]) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pl-vercel-runtime-'));
  directories.push(directory);
  const store = new StateStore(directory);
  const session: DriverSession = {
    async *stream(input) {
      if ('prompt' in input) yield* parts;
      else yield { type: 'text', text: `Decision: ${String(input.output.decision)}` };
    },
    proposal: vi.fn(async () => ({
      baseSha: 'a'.repeat(40),
      proposedSha: 'b'.repeat(40),
      treeSha: 'c'.repeat(40),
      branch: 'master',
      commitMessage: 'Add question',
      diffSummary: '1 file changed',
      diff: 'diff --git a/question b/question\n',
    })),
    refresh: vi.fn(async () => {}),
    checkpoint: vi.fn(async () => ({
      resume: {
        type: 'resume-session' as const,
        harnessId: 'codex',
        specificationVersion: 'harness-v1' as const,
        data: {},
      },
      snapshotId: 'snapshot-1',
    })),
    interrupt: vi.fn(async () => {}),
  };
  const driver: DriverFactory = vi.fn(async () => session);
  const runtime = new Runtime(store, driver, ['private-model-secret']);
  await runtime.initialize();
  const run = request();
  const identity = {
    userId: '1',
    courseId: '2',
    conversationId: run.conversationId,
    sandboxId: run.sandboxId,
  };
  return { directory, store, session, driver, runtime, run, identity };
}

test('persists text and workspace state across runtime replacement and rejects duplicate start', async () => {
  const { store, driver, runtime, run, identity } = await setup();
  await runtime.start(run, identity);
  await runtime.settled(run.conversationId);
  await runtime.start(run, identity);
  expect(driver).toHaveBeenCalledTimes(1);
  const restored = new Runtime(store, driver);
  await restored.initialize();
  expect(restored.snapshot(identity)).toMatchObject({
    response: 'Created the question.',
    activeRunId: null,
    workspaceBackup: { handle: { id: 'snapshot-1' } },
  });
  await restored.start(request(run.conversationId), identity);
  await restored.settled(run.conversationId);
  expect(driver).toHaveBeenLastCalledWith(
    expect.objectContaining({ resume: expect.objectContaining({ harnessId: 'codex' }) }),
  );
});

test('continues a saved approval after restart and delivers a repeated decision once', async () => {
  const { store, driver, session, runtime, run, identity } = await setup([
    { type: 'publish', id: 'tool-1' },
  ]);
  await runtime.start(run, identity);
  await runtime.settled(run.conversationId);
  const snapshot = runtime.snapshot(identity);
  expect(snapshot.activeRunId).toBe(run.runId);
  expect(snapshot.sandboxState).toBe('offline');
  expect(snapshot.pendingApproval).toMatchObject({
    status: 'pending',
    proposedSha: 'b'.repeat(40),
  });
  const restored = new Runtime(store, driver);
  await restored.initialize();
  const decision = {
    ...identity,
    capability: 'test',
    approvalId: snapshot.pendingApproval!.id,
    decision: 'completed' as const,
    result: { commitSha: 'd'.repeat(40), message: 'Published and synced' },
  };
  await restored.decision(decision, identity);
  await restored.settled(run.conversationId);
  await restored.decision(decision, identity);
  expect(driver).toHaveBeenCalledTimes(2);
  expect(session.refresh).toHaveBeenCalledTimes(1);
  const completed = restored.snapshot(identity);
  expect(completed.activeRunId).toBeNull();
  expect(completed.response).toBe('Decision: completed');
  expect(completed.events.filter((event) => event.type === 'sync.completed')).toHaveLength(1);
});

test('denial resumes with an explicit result and never refreshes published content', async () => {
  const { runtime, run, identity, session } = await setup([{ type: 'publish', id: 'tool-1' }]);
  await runtime.start(run, identity);
  await runtime.settled(run.conversationId);
  const approval = runtime.snapshot(identity).pendingApproval!;
  await runtime.decision(
    {
      ...identity,
      capability: 'test',
      approvalId: approval.id,
      decision: 'denied',
      result: { message: 'Do not publish' },
    },
    identity,
  );
  await runtime.settled(run.conversationId);
  expect(session.refresh).not.toHaveBeenCalled();
  expect(runtime.snapshot(identity).response).toBe('Decision: denied');
  expect(runtime.snapshot(identity).events.some((event) => event.type === 'sync.completed')).toBe(
    false,
  );
});

test('rejects cross-owner reads and concurrent conversation runs', async () => {
  const { runtime, run, identity, session } = await setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  session.stream = async function* () {
    yield { type: 'text', text: 'Working' };
    await gate;
  };
  await runtime.start(run, identity);
  expect(() => runtime.snapshot({ ...identity, userId: 'another-user' })).toThrow('unavailable');
  await expect(runtime.start(request(run.conversationId), identity)).rejects.toThrow(
    'already active',
  );
  release();
  await runtime.settled(run.conversationId);
});

test('does not expose an actionable approval when checkpointing fails and redacts errors', async () => {
  const { runtime, run, identity, session } = await setup([{ type: 'publish', id: 'tool-1' }]);
  session.checkpoint = async () => {
    throw new Error('snapshot failed private-model-secret');
  };
  await runtime.start(run, identity);
  await runtime.settled(run.conversationId);
  const snapshot = runtime.snapshot(identity);
  expect(snapshot.pendingApproval).toBeNull();
  expect(snapshot.error).toBe('snapshot failed [redacted]');
  expect(session.interrupt).toHaveBeenCalled();
});

test('an interrupted active run is reported on restart without replaying the prompt', async () => {
  const { store, driver, runtime, run, identity } = await setup();
  await runtime.start(run, identity);
  await runtime.settled(run.conversationId);
  const state = (await store.load(run.conversationId))!;
  state.snapshot.activeRunId = run.runId;
  await store.save(state);
  const restored = new Runtime(store, driver);
  await restored.initialize();
  expect(driver).toHaveBeenCalledTimes(1);
  expect(restored.snapshot(identity)).toMatchObject({ activeRunId: null, status: 'failed' });
  expect(restored.snapshot(identity).error).toContain('not replayed');
});

test('expired workspace snapshots do not silently become fresh workspaces', async () => {
  const { store, runtime, driver, run, identity } = await setup();
  await runtime.start(run, identity);
  await runtime.settled(run.conversationId);
  const state = (await store.load(run.conversationId))!;
  state.snapshot.workspaceBackup!.expiresAt = new Date(0).toISOString();
  await store.save(state);
  const restored = new Runtime(store, driver);
  await restored.initialize();
  await expect(restored.start(request(run.conversationId), identity)).rejects.toThrow('expired');
  expect(driver).toHaveBeenCalledTimes(1);
});

test('separate conversations retain separate saved harness state', async () => {
  const { runtime, store, run, identity } = await setup();
  const second = request();
  await Promise.all([runtime.start(run, identity), runtime.start(second, identity)]);
  await Promise.all([runtime.settled(run.conversationId), runtime.settled(second.conversationId)]);
  expect(await store.list()).toHaveLength(2);
  expect(() => runtime.snapshot({ ...identity, conversationId: second.conversationId })).toThrow(
    'unavailable',
  );
  expect((await store.load(second.conversationId))?.request.sandboxId).toBe(second.sandboxId);
});

test('a failed workspace merge still delivers the recorded publication result to the agent', async () => {
  const { runtime, run, identity, session } = await setup([{ type: 'publish', id: 'tool-1' }]);
  await runtime.start(run, identity);
  await runtime.settled(run.conversationId);
  const approval = runtime.snapshot(identity).pendingApproval!;
  session.refresh = async () => {
    throw new Error('Merge conflict');
  };
  const stream = vi.fn(session.stream);
  session.stream = stream;
  await runtime.decision(
    {
      ...identity,
      capability: 'test',
      approvalId: approval.id,
      decision: 'completed',
      result: { message: 'Published' },
    },
    identity,
  );
  await runtime.settled(run.conversationId);
  expect(stream).toHaveBeenCalledWith({
    toolCallId: 'tool-1',
    output: {
      published: true,
      decision: 'completed',
      message: 'Published',
      workspaceRefreshError: 'Merge conflict',
    },
  });
  expect(runtime.snapshot(identity).status).toBe('waiting_for_user');
});

test('a crash while delivering a decision is not silently replayed on restart', async () => {
  const { store, driver, runtime, run, identity } = await setup([
    { type: 'publish', id: 'tool-1' },
  ]);
  await runtime.start(run, identity);
  await runtime.settled(run.conversationId);
  const state = (await store.load(run.conversationId))!;
  state.continuationDelivered = state.snapshot.pendingApproval!.id;
  state.snapshot.pendingApproval!.status = 'completed';
  state.snapshot.pendingApproval!.result = { published: true };
  await store.save(state);
  const restored = new Runtime(store, driver);
  await restored.initialize();
  expect(driver).toHaveBeenCalledTimes(1);
  expect(restored.snapshot(identity).status).toBe('failed');
  await expect(restored.start(request(run.conversationId), identity)).rejects.toThrow(
    'interrupted while continuing an approval',
  );
});
