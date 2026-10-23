import { afterAll, beforeAll, expect, it } from 'vitest';

import { startScriptedAgent } from '../../../prairielearn/src/tests/utils/course-agent-worker.js';

let agent: Awaited<ReturnType<typeof startScriptedAgent>>;
beforeAll(async () => {
  agent = await startScriptedAgent();
}, 60000);
afterAll(async () => {
  await agent.close();
});
const create = () => agent.create();
const control = (id: string, action: Parameters<typeof agent.control>[1], text?: string) =>
  agent.control(id, action, text);

async function send(id: string) {
  const response = await fetch(`${agent.url}/conversations/${id}/chat`, {
    method: 'POST',
    headers: agent.headers,
    body: JSON.stringify({
      message: { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      context: { courseTitle: 'Test', courseShortName: 'CS 101' },
    }),
  });
  expect(response.status).toBe(200);
  return response;
}

async function open(id: string) {
  const response = await fetch(`${agent.url}/conversations/${id}/chat`, { headers: agent.headers });
  expect(response.status).toBe(200);
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  return {
    reader,
    async next(): Promise<Record<string, unknown>> {
      while (!buffer.includes('\n\n')) {
        const item = await reader.read();
        expect(item.done).toBe(false);
        buffer += item.value;
      }
      const end = buffer.indexOf('\n\n');
      const data = buffer.slice(0, end).slice(6);
      buffer = buffer.slice(end + 2);
      return JSON.parse(data);
    },
    async final() {
      for (;;) {
        const frame = await this.next();
        if (frame.type === 'snapshot' && frame.phase === 'final') return frame;
      }
    },
  };
}

it('replays a short partial reply after disconnection, then saves the same reply once', async () => {
  const id = await create();
  const post = await send(id);
  const assistant = post.headers.get('X-Assistant-Message-Id');
  expect(assistant).toBeTruthy();
  await expect.poll(async () => (await control(id, 'stats')).ready).toBe(true);
  await control(id, 'advance', 'Hello');
  await post.body!.cancel();
  const chat = await open(id);
  const initial = await chat.next();
  expect(initial).toMatchObject({
    type: 'snapshot',
    reply: { status: 'running', assistantMessageId: assistant },
  });
  const replay = [];
  while (!JSON.stringify(replay).includes('Hello')) replay.push(await chat.next());
  await control(id, 'advance', ' again');
  await control(id, 'finish');
  const final = await chat.final();
  expect(final).toMatchObject({
    reply: { status: 'idle' },
    messages: [
      { role: 'user' },
      { id: assistant, role: 'assistant', parts: [{ type: 'text', text: 'Hello again' }] },
    ],
  });
  expect((await control(id, 'stats')).calls).toBe(1);
  const saved = await open(id);
  expect(await saved.next()).toMatchObject({ reply: { status: 'idle' }, messages: final.messages });
  expect((await saved.reader.read()).done).toBe(true);
}, 15000);

it('explicit Stop persists partial output and stale Stop cannot cancel a successor', async () => {
  const id = await create();
  const first = await send(id);
  const firstId = first.headers.get('X-Assistant-Message-Id');
  await expect.poll(async () => (await control(id, 'stats')).ready).toBe(true);
  await control(id, 'advance', 'Partial');
  const stop = await fetch(`${agent.url}/conversations/${id}/stop`, {
    method: 'POST',
    headers: agent.headers,
    body: JSON.stringify({ assistantMessageId: firstId }),
  });
  expect(stop.status).toBe(202);
  expect(await first.text()).toContain('Partial');
  const second = await send(id);
  const stale = await fetch(`${agent.url}/conversations/${id}/stop`, {
    method: 'POST',
    headers: agent.headers,
    body: JSON.stringify({ assistantMessageId: firstId }),
  });
  expect(stale.status).toBe(204);
  await control(id, 'finish');
  await second.text();
}, 15000);

it('survives completion while a reader pauses at its initial snapshot', async () => {
  const id = await create();
  const post = await send(id);
  const read = await open(id);
  await read.next();
  await expect.poll(async () => (await control(id, 'stats')).ready).toBe(true);
  await control(id, 'advance', 'Complete answer');
  await control(id, 'finish');
  await post.text();
  expect(await read.final()).toMatchObject({
    messages: [{ role: 'user' }, { role: 'assistant', parts: [{ text: 'Complete answer' }] }],
  });
}, 15000);

it('a provider failure settles readers with saved history and a failed state', async () => {
  const id = await create();
  const post = await send(id);
  const read = await open(id);
  await read.next();
  await expect.poll(async () => (await control(id, 'stats')).ready).toBe(true);
  await control(id, 'fail');
  await post.text();
  expect(await read.final()).toMatchObject({
    reply: { status: 'failed', error: { code: 'reply_failed' } },
  });
});

it('recovers durable partial output after a Worker restart without rerunning the model', async () => {
  const id = await create();
  const post = await send(id);
  await expect.poll(async () => (await control(id, 'stats')).ready).toBe(true);
  await control(id, 'advance', 'Durable partial');
  const observed = await open(id);
  let frame = await observed.next();
  while (!JSON.stringify(frame).includes('Durable partial')) frame = await observed.next();
  await observed.reader.cancel();
  await post.body!.cancel();
  await agent.restart();
  const read = await open(id);
  const snapshot = await read.next();
  expect(JSON.stringify(snapshot)).toContain('Durable partial');
  expect(snapshot).toMatchObject({
    reply: { status: 'failed', error: { code: 'reply_interrupted' } },
  });
  expect((await control(id, 'stats')).calls).toBe(0);
  expect((await read.reader.read()).done).toBe(true);
  const next = await send(id);
  await control(id, 'finish');
  await next.text();
  expect((await control(id, 'stats')).calls).toBe(1);
}, 60000);
