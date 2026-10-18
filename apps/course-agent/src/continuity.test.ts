import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

import {
  type Command,
  type ServerFrame,
  ServerFrameSchema,
  type Snapshot,
} from '@prairielearn/course-agent-protocol';

const port = 18791;
const base = `http://127.0.0.1:${port}`;
const headers = { Authorization: 'Bearer scripted-local-test-only' };
const context = { courseTitle: 'Test', courseShortName: 'QA 101' };
let child: ChildProcess;
let storage: string;
let logs = '';

async function startWorker() {
  child = spawn(
    path.resolve(import.meta.dirname, '../node_modules/.bin/wrangler'),
    [
      'dev',
      '--config',
      path.resolve(import.meta.dirname, '../test/wrangler.jsonc'),
      '--port',
      String(port),
      '--persist-to',
      storage,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout?.on('data', (chunk) => {
    logs = (logs + String(chunk)).slice(-20_000);
  });
  child.stderr?.on('data', (chunk) => {
    logs = (logs + String(chunk)).slice(-20_000);
  });
  try {
    await vi.waitFor(
      async () => {
        expect((await fetch(base)).status).toBe(401);
      },
      { timeout: 45_000, interval: 100 },
    );
  } catch (err) {
    throw new Error(`Worker startup failed: ${logs}`, { cause: err });
  }
}

async function stopWorker() {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await once(child, 'exit');
}
beforeAll(async () => {
  storage = await mkdtemp(path.join(tmpdir(), 'course-agent-continuity-'));
  await startWorker();
}, 60_000);
afterAll(async () => {
  await stopWorker();
  await rm(storage, { recursive: true, force: true });
});

async function create() {
  const response = await fetch(`${base}/conversations`, { method: 'POST', headers });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function snapshot(id: string) {
  const response = await fetch(`${base}/conversations/${id}/snapshot`, { headers });
  expect(response.ok).toBe(true);
  return (await response.json()) as Snapshot;
}

async function control(id: string, action: string, text?: string) {
  const response = await fetch(`${base}/__test/${id}/${action}`, {
    method: 'POST',
    headers,
    body: text,
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as { calls: number; ready: boolean; durableChunks: number };
}

async function connect(id: string) {
  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/conversations/${id}/socket`, {
    headers,
  });
  const frames: ServerFrame[] = [];
  socket.on('message', (data) => frames.push(ServerFrameSchema.parse(JSON.parse(data.toString()))));
  await once(socket, 'open');
  return {
    socket,
    frames,
    async command<M extends Command['method']>(
      method: M,
      params: Extract<Command, { method: M }>['params'],
    ) {
      const ref = crypto.randomUUID();
      socket.send(JSON.stringify({ type: 'command', ref, method, params }));
      await expect
        .poll(() => frames.find((frame) => frame.type !== 'event' && frame.ref === ref), {
          timeout: 5000,
        })
        .toBeDefined();
      const result = frames.find((frame) => frame.type !== 'event' && frame.ref === ref);
      return result;
    },
  };
}

async function waitForIdle(id: string) {
  await expect
    .poll(async () => (await snapshot(id)).summary.status, { timeout: 5000 })
    .toBe('waiting_for_user');
}

it('reattaches before the first token; observer disconnect never cancels generation', async () => {
  const id = await create();
  const first = await connect(id);
  await first.command('conversation.subscribe', { mode: 'full' });
  expect((await first.command('turn.start', { text: 'hello', context }))?.type).toBe('result');
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  first.socket.close();
  const second = await connect(id);
  await second.command('conversation.subscribe', { mode: 'full' });
  expect(
    second.frames.some(
      (frame) =>
        frame.type === 'event' &&
        frame.event === 'conversation.snapshot' &&
        frame.data.summary.status === 'waiting_for_agent',
    ),
  ).toBe(true);
  await control(id, 'advance', 'Hello');
  await control(id, 'finish');
  await waitForIdle(id);
  const messages = (await snapshot(id)).messages;
  expect(
    messages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.parts.map((part) => part.text).join('')),
  ).toEqual(['Hello']);
  expect((await control(id, 'stats')).calls).toBe(1);
  second.socket.close();
});

it('returns a partial snapshot followed only by new output, and persists one completed message', async () => {
  const id = await create();
  const command = await connect(id);
  await command.command('turn.start', { text: 'hello', context });
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  await control(id, 'advance', 'Hel');
  await expect.poll(async () => (await snapshot(id)).messages.at(-1)?.parts[0]?.text).toBe('Hel');
  const observer = await connect(id);
  await observer.command('conversation.subscribe', { mode: 'full' });
  const initial = observer.frames.find(
    (frame) => frame.type === 'event' && frame.event === 'conversation.snapshot',
  );
  expect(
    initial?.type === 'event' &&
      initial.event === 'conversation.snapshot' &&
      initial.data.messages.at(-1)?.parts[0]?.text,
  ).toBe('Hel');
  await control(id, 'advance', 'lo');
  await control(id, 'finish');
  await waitForIdle(id);
  expect(
    observer.frames
      .filter((frame) => frame.type === 'event' && frame.event === 'message.delta')
      .map((frame) => frame.type === 'event' && frame.event === 'message.delta' && frame.data.text)
      .join(''),
  ).toBe('lo');
  expect(
    (await snapshot(id)).messages.filter((message) => message.role === 'assistant'),
  ).toHaveLength(1);
  command.socket.close();
  observer.socket.close();
});

it('streams summary-only completion and scopes Stop to the requested turn', async () => {
  const id = await create();
  const command = await connect(id);
  const observer = await connect(id);
  await observer.command('conversation.subscribe', { mode: 'summary' });
  const accepted = await command.command('turn.start', { text: 'hello', context });
  expect(accepted?.type).toBe('result');
  if (accepted?.type !== 'result' || !accepted.result.turnId) {
    throw new Error('Missing accepted turn');
  }
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  await control(id, 'advance', 'Partial');
  await command.command('turn.stop', { turnId: accepted.result.turnId });
  await waitForIdle(id);
  expect((await snapshot(id)).messages.at(-1)?.parts[0]?.text).toBe('Partial');
  await command.command('turn.start', { text: 'next', context });
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  await command.command('turn.stop', { turnId: accepted.result.turnId });
  expect((await snapshot(id)).summary.status).toBe('waiting_for_agent');
  await control(id, 'finish');
  await waitForIdle(id);
  expect(
    observer.frames
      .filter((frame) => frame.type === 'event')
      .every((frame) => frame.type === 'event' && frame.event === 'conversation.status_changed'),
  ).toBe(true);
  expect(
    observer.frames.some(
      (frame) =>
        frame.type === 'event' &&
        frame.event === 'conversation.status_changed' &&
        frame.data.latestAssistantMessageId !== null,
    ),
  ).toBe(true);
  command.socket.close();
  observer.socket.close();
});

it('rejects native SDK mutation frames and unauthorized HTTP paths', async () => {
  const id = await create();
  const attack = await connect(id);
  const closed = once(attack.socket, 'close');
  attack.socket.send(
    JSON.stringify({
      type: 'cf_agent_chat_messages',
      messages: [{ id: 'injected', role: 'user', parts: [] }],
    }),
  );
  expect((await closed)[0]).toBe(1008);
  expect((await snapshot(id)).messages).toEqual([]);
  for (const pathname of [
    '/get-messages',
    '/agents/conversation/test',
    `/conversations/${id}/chat`,
    `/conversations/${id}/messages`,
  ]) {
    expect((await fetch(`${base}${pathname}`, { headers })).status).toBe(404);
  }
  expect((await fetch(`${base}/conversations`, { method: 'POST' })).status).toBe(401);
});

it('saves an interrupted partial reply after a real Worker restart without redispatching', async () => {
  const id = await create();
  const command = await connect(id);
  await command.command('turn.start', { text: 'hello', context });
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  await control(id, 'advance', 'Saved partial');
  await expect
    .poll(async () => (await control(id, 'stats')).durableChunks, { timeout: 5000 })
    .toBeGreaterThan(2);
  command.socket.close();
  await stopWorker();
  await startWorker();
  await expect
    .poll(async () => (await snapshot(id)).summary.status, { timeout: 10000 })
    .toBe('blocked');
  await expect
    .poll(
      async () =>
        (await snapshot(id)).messages.find((message) => message.role === 'assistant')?.parts[0]
          ?.text,
      { timeout: 10000 },
    )
    .toBe('Saved partial');
  expect((await control(id, 'stats')).calls).toBe(0);
  const resumed = await connect(id);
  expect((await resumed.command('conversation.resume', {}))?.type).toBe('result');
  await waitForIdle(id);
  resumed.socket.close();
}, 60_000);

it('clears busy state for an empty completion and blocks a failed producer without leaking its error', async () => {
  const id = await create();
  const command = await connect(id);
  await command.command('turn.start', { text: 'empty', context });
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  await control(id, 'finish');
  await waitForIdle(id);
  expect((await snapshot(id)).summary.capabilities.send).toBe(true);
  await command.command('turn.start', { text: 'fail', context });
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  await control(id, 'fail');
  await expect.poll(async () => (await snapshot(id)).summary.status).toBe('blocked');
  expect((await snapshot(id)).summary.error).toBe('The agent could not finish its reply.');
  command.socket.close();
});

it('admits only one of two simultaneous sends without duplicating user messages', async () => {
  const id = await create();
  const first = await connect(id);
  const second = await connect(id);
  const results = await Promise.all([
    first.command('turn.start', { text: 'A', context }),
    second.command('turn.start', { text: 'B', context }),
  ]);
  expect(results.map((result) => result?.type).sort()).toEqual(['error', 'result']);
  expect((await snapshot(id)).messages.filter((message) => message.role === 'user')).toHaveLength(
    1,
  );
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  await control(id, 'finish');
  await waitForIdle(id);
  first.socket.close();
  second.socket.close();
});

it('reconciles a completion racing subscription without missing or duplicating the assistant', async () => {
  const id = await create();
  const command = await connect(id);
  await command.command('turn.start', { text: 'race', context });
  await expect.poll(async () => (await control(id, 'stats')).ready, { timeout: 5000 }).toBe(true);
  await control(id, 'advance', 'Final response');
  const observer = await connect(id);
  await Promise.all([
    control(id, 'finish'),
    observer.command('conversation.subscribe', { mode: 'full' }),
  ]);
  await waitForIdle(id);
  const initial = observer.frames.find(
    (frame) => frame.type === 'event' && frame.event === 'conversation.snapshot',
  );
  const completed = observer.frames.filter(
    (frame) => frame.type === 'event' && frame.event === 'message.completed',
  );
  expect(initial?.type).toBe('event');
  const messages = (await snapshot(id)).messages.filter((message) => message.role === 'assistant');
  expect(messages).toHaveLength(1);
  expect(messages[0].parts[0].text).toBe('Final response');
  expect(completed.length).toBeLessThanOrEqual(1);
  command.socket.close();
  observer.socket.close();
});

it('paginates the SDK-owned history without loading or duplicating the full transcript', async () => {
  const id = await create();
  await control(id, 'seed');
  const newest = await snapshot(id);
  expect(newest.messages).toHaveLength(50);
  expect(newest.hasMore).toBe(true);
  const response = await fetch(
    `${base}/conversations/${id}/snapshot?before=${newest.messages[0].id}`,
    { headers },
  );
  const older = (await response.json()) as Snapshot;
  expect(older.messages).toHaveLength(10);
  expect(older.hasMore).toBe(false);
  const messages = [...older.messages, ...newest.messages];
  expect(new Set(messages.map((message) => message.id)).size).toBe(60);
  expect(messages.map((message) => message.parts[0].text)).toEqual(
    Array.from({ length: 60 }, (_, index) => `History ${index}`),
  );
});
