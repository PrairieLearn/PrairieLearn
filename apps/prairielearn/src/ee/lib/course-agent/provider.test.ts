import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

import {
  type ServiceScope,
  conversationBindingSchema,
  sendRequestSchema,
  verifyServiceRequest,
} from '@prairielearn/course-agent-contract';

import { createAgentClient } from './provider.js';

const secret = 'local-http-contract-fixture-not-a-secret';
const scope: ServiceScope = {
  conversationId: randomUUID(),
  courseId: '1',
  userId: '2',
  authnUserId: '2',
};
let origin: URL;
let handler: (req: IncomingMessage, res: ServerResponse, body: string) => Promise<void>;
const requests: string[] = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  const request = new Request(new URL(req.url!, origin), { method: req.method, headers });
  const signed = await verifyServiceRequest(request, secret, 'agent-api', body);
  if (signed?.conversationId !== scope.conversationId || signed.userId !== scope.userId) {
    res.writeHead(401).end();
    return;
  }
  requests.push(req.url!);
  await handler(req, res, body);
});
beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});
beforeEach(() => {
  requests.length = 0;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('uses scoped JSON HTTP and retries an uncertain acceptance under the same command identity', async () => {
  const accepted = new Map<string, string>();
  let launches = 0;
  handler = async (_req, res, body) => {
    const input = JSON.parse(body) as { id: string; text: string };
    if (accepted.has(input.id) && accepted.get(input.id) !== input.text) {
      res
        .writeHead(409, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ message: 'Message identity changed.' }));
      return;
    }
    if (!accepted.has(input.id)) {
      accepted.set(input.id, input.text);
      launches++;
      res.destroy();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ revision: 1 }));
  };
  const client = createAgentClient(origin, scope, secret);
  const input = { id: randomUUID(), text: '  Preserve submitted text.  ', expectedRevision: 0 };
  await expect(client.send(input, AbortSignal.timeout(2000))).rejects.toMatchObject({
    status: 502,
  });
  expect(await client.send(input, AbortSignal.timeout(2000))).toEqual({ revision: 1 });
  expect(launches).toBe(1);
  await expect(
    client.send({ ...input, text: 'Changed' }, AbortSignal.timeout(2000)),
  ).rejects.toMatchObject({ status: 409 });
});

test('rejects a malformed receipt at the HTTP boundary', async () => {
  handler = async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        messages: [],
        revision: 0,
        blocked: false,
        executions: { invalid: { status: 'finished' } },
      }),
    );
  };
  await expect(
    createAgentClient(origin, scope, secret).getSnapshot(AbortSignal.timeout(2000)),
  ).rejects.toThrow();
});

test('replays AI chunks over SSE and detaches observation without sending Stop', async () => {
  const chunks = [
    { type: 'start', messageId: 'assistant-1' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'Hello' },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish' },
  ];
  handler = async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.end('data: [DONE]\n\n');
  };
  const connection = await createAgentClient(origin, scope, secret).connect(
    AbortSignal.timeout(2000),
  );
  const stream = (await connection.resume())!;
  const observed = [];
  for await (const chunk of stream) observed.push(chunk);
  connection.close();
  expect(observed).toEqual(chunks);
  expect(requests).toEqual([`/v1/conversations/${scope.conversationId}/stream`]);
});

test('rejects a different service signature without exposing history', async () => {
  handler = async () => {
    throw new Error('Unauthenticated request reached history');
  };
  await expect(
    createAgentClient(origin, scope, 'wrong-signing-key').getHistory(AbortSignal.timeout(2000)),
  ).rejects.toMatchObject({ status: 401 });
});

test('runs the PL adapter against a reference HTTP backend with no Cloudflare runtime', async () => {
  const messages: {
    id: string;
    role: 'user' | 'assistant';
    parts: { type: 'text'; text: string }[];
  }[] = [];
  const usage = {
    version: 0,
    model: 'reference-model',
    input: 0,
    cached: 0,
    cacheWrite: 0,
    output: 0,
  };
  const diagnostics = { state: 'absent', idleExpiresAt: null, interactionExpiresAt: null };
  let revision = 0;
  let binding: string | undefined;
  handler = async (req, res, body) => {
    const url = new URL(req.url!, origin);
    const endpoint = url.pathname.split('/').at(-1);
    const respond = (value: unknown, status = 200) =>
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
    if (req.method === 'PUT') {
      const input = JSON.stringify(conversationBindingSchema.parse(JSON.parse(body)));
      if (binding && binding !== input) {
        respond({ message: 'Conversation destination changed.' }, 409);
        return;
      }
      binding = input;
      respond({ model: usage.model });
    } else if (endpoint === 'messages') {
      const input = sendRequestSchema.parse(JSON.parse(body));
      if (input.expectedRevision !== revision) {
        respond({ message: 'Conversation changed.' }, 409);
        return;
      }
      messages.push(
        { id: input.id, role: 'user', parts: [{ type: 'text', text: input.text }] },
        {
          id: 'answer-' + input.id,
          role: 'assistant',
          parts: [{ type: 'text', text: 'Reference reply.' }],
        },
      );
      respond({ revision: ++revision });
    } else if (endpoint === 'snapshot') {
      respond({ messages, revision, blocked: false, executions: {}, conversationUsage: usage });
    } else if (endpoint === 'history') {
      const after = url.searchParams.get('cursor');
      const index = after ? messages.findIndex((message) => message.id === after) + 1 : 0;
      respond({
        messages: messages.slice(index, index + 1),
        nextCursor: index + 1 < messages.length ? messages[index].id : null,
      });
    } else if (endpoint === 'runtime') {
      respond({ running: false, finishedAt: null });
    } else if (endpoint === 'diagnostics') {
      respond(diagnostics);
    } else if (endpoint === 'export') {
      respond({
        version: 1,
        conversationId: scope.conversationId,
        exportedAt: Date.now(),
        revision,
        messages,
        usage,
        diagnostics,
      });
    } else if (endpoint === 'events') {
      res
        .writeHead(200, { 'Content-Type': 'text/event-stream' })
        .end('data: {"type":"changed"}\n\ndata: [DONE]\n\n');
    } else if (endpoint === 'stop' || endpoint === 'cleanup' || endpoint === 'retention') {
      respond({ accepted: true });
    } else {
      respond({ message: 'Unknown route' }, 404);
    }
  };
  const client = createAgentClient(origin, scope, secret);
  const signal = AbortSignal.timeout(5000);
  expect(await client.configure({ repository: 'example/course', branch: 'main' }, signal)).toEqual({
    model: usage.model,
  });
  expect(
    await client.send({ id: randomUUID(), expectedRevision: 0, text: 'Keep my history.' }, signal),
  ).toEqual({ revision: 1 });
  expect((await client.getSnapshot(signal)).messages).toEqual(messages);
  expect(await client.getHistory(signal)).toEqual(messages);
  expect(await client.getRuntime(signal)).toEqual({ running: false, finishedAt: null });
  expect(await client.getDiagnostics(signal)).toEqual(diagnostics);
  expect((await client.exportConversation(signal)).messages).toEqual(messages);
  let changed = 0;
  const detach = await client.watch(
    signal,
    () => changed++,
    () => {},
  );
  await expect.poll(() => changed).toBe(1);
  detach();
  await client.cancel(signal);
  await client.retryCleanup(signal);
  await client.requestRetention(signal);
  await expect(
    client.configure({ repository: 'example/other', branch: 'main' }, signal),
  ).rejects.toMatchObject({ status: 409 });
});
