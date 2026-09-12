import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import * as runtime from '../../lib/course-agent/ephemeral-runtime.js';
import * as redis from '../../lib/course-agent/redis.js';

import router from './courseAgent.js';

const conversationId = '9a6d8f44-d55b-4e73-8b9b-547dd00fb400';
const runId = '40cff9bd-6931-4405-a8e6-57f93a190d4b';
const sandboxId = `course-agent-${conversationId}`;
let server: Server;
let url: string;

beforeEach(async () => {
  vi.spyOn(runtime, 'getEphemeralCourseAgentSnapshot');
  vi.spyOn(runtime, 'getEphemeralCourseAgentStream');
  vi.spyOn(redis, 'getCourseAgentStreamContext').mockResolvedValue({
    resumeExistingStream: vi.fn().mockResolvedValue(null),
  } as unknown as Awaited<ReturnType<typeof redis.getCourseAgentStreamContext>>);
  const app = express();
  app.use((_req, res, next) => {
    Object.assign(res.locals, {
      course_agent_enabled: true,
      course: { id: '1' },
      authn_user: { id: '2' },
    });
    next();
  });
  app.use(router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/stream?${new URLSearchParams({ conversationId, sandboxId, runId })}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.restoreAllMocks();
});

it('follows live Worker output when an active run has no Redis stream', async () => {
  vi.mocked(runtime.getEphemeralCourseAgentSnapshot).mockResolvedValue({
    activeRunId: runId,
    events: [],
  } as unknown as Awaited<ReturnType<typeof runtime.getEphemeralCourseAgentSnapshot>>);
  let output!: ReadableStreamDefaultController<string>;
  vi.mocked(runtime.getEphemeralCourseAgentStream).mockResolvedValue(
    new ReadableStream<string>({
      start(controller) {
        output = controller;
        controller.enqueue('data: {"type":"start"}\n\n');
      },
    }),
  );
  const response = await fetch(url);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"start"');
  output.enqueue('data: {"type":"finish"}\n\n');
  output.close();
  let remaining = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    remaining += new TextDecoder().decode(value);
  }
  expect(remaining).toContain('"type":"finish"');
  expect(runtime.getEphemeralCourseAgentStream).toHaveBeenCalledWith({
    courseId: '1',
    userId: '2',
    conversationId,
    sandboxId,
    runId,
  });
});

it('replays a completed snapshot without opening a live Worker stream', async () => {
  vi.mocked(runtime.getEphemeralCourseAgentSnapshot).mockResolvedValue({
    activeRunId: null,
    events: [
      {
        sequence: 0,
        type: 'user.message',
        occurredAt: '2026-09-12T00:00:00.000Z',
        data: { runId, text: 'Hello' },
      },
      {
        sequence: 1,
        type: 'agent.completed',
        occurredAt: '2026-09-12T00:00:01.000Z',
        data: { response: 'Hello world' },
      },
    ],
  } as unknown as Awaited<ReturnType<typeof runtime.getEphemeralCourseAgentSnapshot>>);
  const response = await fetch(url);
  const body = await response.text();
  expect(response.status).toBe(200);
  expect(body).toContain('Hello world');
  expect(body).toContain('"type":"finish"');
  expect(runtime.getEphemeralCourseAgentStream).not.toHaveBeenCalled();
});
