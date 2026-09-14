import { createHash, createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test, vi } from 'vitest';

import { CourseAgentStartRunRequestSchema } from '@prairielearn/course-agent-protocol';

import type { DriverFactory, DriverSession } from './driver.ts';
import { Runtime } from './runtime.ts';
import { createRuntimeServer } from './server.ts';
import { StateStore } from './state.ts';

const secret = 'course-agent-local-test-capability-secret';

function sign(data: unknown) {
  const date = Date.now().toString(36);
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${date}.${encoded}`).digest('hex');
  return `${Buffer.from(signature).toString('base64url')}.${date}.${encoded}`;
}

test('the signed HTTP boundary rejects tampering and replays a completed event stream', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pl-vercel-http-'));
  const driver: DriverFactory = vi.fn(
    async (): Promise<DriverSession> => ({
      async *stream() {
        yield { type: 'text' as const, text: 'Question ready.' };
      },
      proposal: vi.fn(),
      refresh: vi.fn(),
      checkpoint: async () => ({
        resume: {
          type: 'resume-session',
          harnessId: 'codex',
          specificationVersion: 'harness-v1',
          data: {},
        },
        snapshotId: 'snapshot-1',
      }),
      interrupt: vi.fn(),
    }),
  );
  const runtime = new Runtime(new StateStore(directory), driver);
  await runtime.initialize();
  const server = createRuntimeServer(runtime, secret);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  const origin = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) =>
    fetch(`${origin}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const run = CourseAgentStartRunRequestSchema.parse({
      capability: 'placeholder',
      conversationId: randomUUID(),
      runId: randomUUID(),
      sandboxId: `course-agent-${randomUUID()}`,
      prompt: 'Create a question.',
      course: {
        repository: 'https://github.com/PrairieLearn/test.git',
        branch: 'master',
        expectedSha: null,
      },
      authoringContext: { courseInstance: null },
      runtimeSettings: {},
    });
    const identity = {
      userId: '1',
      courseId: '2',
      conversationId: run.conversationId,
      sandboxId: run.sandboxId,
    };
    const capability = {
      ...identity,
      type: 'course-agent-run',
      runId: run.runId,
      promptDigest: createHash('sha256').update(run.prompt).digest('hex'),
      ...run.course,
      authoringContext: run.authoringContext,
      runtimeSettings: run.runtimeSettings,
      workspaceBackup: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    run.capability = sign(capability);
    expect((await post('/v1/runs', { ...run, prompt: 'Tampered prompt' })).status).toBe(400);
    expect(
      (
        await post('/v1/runs', {
          ...run,
          capability: sign({ ...capability, expiresAt: new Date(0).toISOString() }),
        })
      ).status,
    ).toBe(400);
    expect(driver).not.toHaveBeenCalled();
    expect((await post('/v1/runs', run)).status).toBe(202);
    await runtime.settled(run.conversationId);
    const inspect = { ...identity, type: 'course-agent-inspect', expiresAt: capability.expiresAt };
    const request = { ...identity, capability: sign(inspect) };
    expect(
      (await post('/v1/snapshot', { ...request, capability: sign({ ...inspect, userId: '3' }) }))
        .status,
    ).toBe(400);
    expect(await (await post('/v1/snapshot', request)).json()).toMatchObject({
      response: 'Question ready.',
      activeRunId: null,
    });
    const stream = await post('/v1/stream', request);
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    const events = (await stream.text())
      .trim()
      .split('\n\n')
      .map((event) => JSON.parse(event.slice('data: '.length)));
    expect(events[0]).toMatchObject({ type: 'user.message', data: { runId: run.runId } });
    expect(events.at(-1)).toMatchObject({
      type: 'agent.completed',
      data: { response: 'Question ready.' },
    });
    expect((await post('/v1/runs', run)).status).toBe(202);
    expect(driver).toHaveBeenCalledTimes(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await runtime.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});
