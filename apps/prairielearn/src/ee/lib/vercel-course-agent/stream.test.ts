import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { claimConversation, createConversation } from './conversations.js';
import { streamConversation } from './stream.js';

const fake = vi.hoisted(() => ({
  create: vi.fn(),
  createSession: vi.fn(),
  stream: vi.fn(),
  detach: vi.fn(),
  stop: vi.fn(),
  hasUnfinishedTurn: vi.fn(),
}));
vi.mock('./sandbox.js', () => ({
  sandboxLifetimeMs: 30 * 60_000,
  createSandboxAgent: fake.create,
}));

beforeEach(() => {
  fake.create.mockResolvedValue({
    agent: { createSession: fake.createSession, stream: fake.stream },
    sandbox: { stop: fake.stop },
  });
  fake.createSession.mockResolvedValue({
    detach: fake.detach,
    hasUnfinishedTurn: fake.hasUnfinishedTurn,
  });
  fake.hasUnfinishedTurn.mockReturnValue(false);
  fake.detach.mockResolvedValue({ harness: { threadId: 'thread-1' } });
  fake.stop.mockResolvedValue(undefined);
  fake.stream.mockImplementation(async () => ({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-start', id: 'text' });
        controller.enqueue({ type: 'text-delta', id: 'text', text: 'Hello from Codex' });
        controller.enqueue({ type: 'text-end', id: 'text' });
        controller.close();
      },
    }),
  }));
});
afterEach(() => vi.resetAllMocks());

const owner = { courseId: '1', userId: '2', authnUserId: '3' };

async function runTurn(conversationId: string, prompt: string) {
  const conversation = claimConversation(conversationId, owner);
  let finished = Promise.resolve();
  const server = createServer((_req, res) => {
    finished = streamConversation(conversation, prompt, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}`);
    const text = await response.text();
    await finished;
    return { conversation, text };
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

test('streams native SDK output, releases the claim after draining, and resumes with only new text', async () => {
  const { conversationId } = createConversation(owner);
  const first = await runTurn(conversationId, 'First message');
  expect(first.text).toContain('Hello from Codex');
  expect(first.conversation.busy).toBe(false);
  expect(first.conversation.failed).toBe(false);
  await runTurn(conversationId, 'Follow-up');
  expect(fake.create).toHaveBeenCalledTimes(1);
  expect(fake.createSession.mock.calls[1][0].resumeFrom).toEqual({
    harness: { threadId: 'thread-1' },
  });
  expect(fake.stream.mock.calls.map(([options]) => options.prompt)).toEqual([
    'First message',
    'Follow-up',
  ]);
  expect(fake.stop).not.toHaveBeenCalled();
});

test('redacts provider errors and stops failed sandboxes', async () => {
  fake.stream.mockRejectedValue(new Error('secret-provider-credential'));
  const { conversationId } = createConversation(owner);
  const { conversation, text } = await runTurn(conversationId, 'Hello');
  expect(text).toContain('Start over');
  expect(text).not.toContain('secret-provider-credential');
  expect(conversation.failed).toBe(true);
  expect(conversation.busy).toBe(false);
  expect(fake.stop).toHaveBeenCalledOnce();
  expect(fake.detach).not.toHaveBeenCalled();
});

test('aborts the native turn and stops the sandbox when the browser disconnects', async () => {
  fake.stream.mockImplementation(async ({ abortSignal }: { abortSignal: AbortSignal }) => ({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-start', id: 'text' });
        abortSignal.addEventListener('abort', () => controller.close(), { once: true });
      },
    }),
  }));
  const { conversationId } = createConversation(owner);
  const conversation = claimConversation(conversationId, owner);
  let finished = Promise.resolve();
  const server = createServer((_req, res) => {
    finished = streamConversation(conversation, 'Hello', res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  try {
    const abort = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}`, { signal: abort.signal });
    const reader = response.body!.getReader();
    await reader.read();
    expect(conversation.busy).toBe(true);
    abort.abort();
    await finished;
    expect(fake.stream.mock.calls[0][0].abortSignal.aborted).toBe(true);
    expect(conversation.failed).toBe(true);
    expect(conversation.busy).toBe(false);
    expect(fake.stop).toHaveBeenCalledOnce();
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
