import assert from 'node:assert/strict';

import { test } from 'vitest';

import { AppServer, AppServerError, type Socket } from '../src/app-server.js';

class FakeSocket implements Socket {
  private listeners = new Map<string, ((event: { data: unknown }) => void)[]>();
  addEventListener(type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  sent: {
    id?: number;
    method?: string;
    params?: unknown;
    error?: { code: number };
  }[] = [];

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.listeners.get('close')?.forEach((listener) => listener({ data: null }));
  }

  receive(frame: unknown) {
    this.listeners.get('message')?.forEach((listener) => listener({ data: JSON.stringify(frame) }));
  }
}
test('correlates concurrent replies and forwards notifications independently', async () => {
  const socket = new FakeSocket();
  const client = new AppServer(socket);
  const first = client.request('thread/read', { threadId: 'first' });
  const second = client.request('thread/read', { threadId: 'second' });
  let received = 0;
  client.subscribe(() => received++);
  socket.receive({
    method: 'item/agentMessage/delta',
    params: { threadId: 'first', turnId: 't', itemId: 'i', delta: 'hello' },
  });
  socket.receive({ id: 2, result: { thread: { id: 'second' } } });
  socket.receive({ id: 1, result: { thread: { id: 'first' } } });
  assert.equal((await first).thread.id, 'first');
  assert.equal((await second).thread.id, 'second');
  assert.equal(received, 1);
  client.close();
});
test('disconnect rejects in-flight mutations without replay', async () => {
  const socket = new FakeSocket();
  const client = new AppServer(socket);
  const result = client.request('turn/interrupt', {
    threadId: 'thread',
    turnId: 'turn',
  });
  socket.close();
  await assert.rejects(result, /connection closed/);
  assert.equal(socket.sent.length, 1);
});
test('unsupported server requests get errors instead of hanging', () => {
  const socket = new FakeSocket();
  const client = new AppServer(socket);
  socket.receive({ id: 7, method: 'item/tool/requestUserInput', params: {} });
  assert.equal(socket.sent[0].error?.code, -32601);
  client.close();
});
test('malformed frames close the connection and reject pending requests', async () => {
  const socket = new FakeSocket();
  const client = new AppServer(socket);
  const result = client.request('thread/read', { threadId: 'thread' });
  socket.receive({ id: [] });
  await assert.rejects(result, /Invalid Codex/);
});

test('RPC rejections remain distinguishable from uncertain disconnects', async () => {
  const socket = new FakeSocket();
  const client = new AppServer(socket);
  const result = client.request('turn/steer', {
    threadId: 'thread',
    expectedTurnId: 'turn',
    input: [],
  });
  socket.receive({ id: 1, error: { code: -32600, message: 'No active turn' } });
  await assert.rejects(result, (error) => error instanceof AppServerError && error.code === -32600);
  client.close();
});

test('initialization negotiates experimental tools before completing the handshake', async () => {
  const socket = new FakeSocket();
  const client = new AppServer(socket);
  const initialized = client.initialize();
  assert.equal(socket.sent[0].method, 'initialize');
  assert.deepEqual(socket.sent[0].params, {
    capabilities: { experimentalApi: true, requestAttestation: false },
    clientInfo: {
      name: 'pl_sandbox_prototype',
      title: 'PL sandbox prototype',
      version: '1',
    },
  });
  assert.equal(socket.sent.length, 1);
  socket.receive({ id: socket.sent[0].id, result: { userAgent: 'test' } });
  await initialized;
  assert.equal(socket.sent[1].method, 'initialized');
  client.close();
});
