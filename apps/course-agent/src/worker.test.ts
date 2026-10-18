import { getAgentByName } from 'agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Env } from './env.js';
import { parseRoute } from './http/routes.js';
import worker from './worker.js';

const conversation = vi.hoisted(() => ({
  fetch: vi.fn<(request: Request) => Promise<Response>>(),
}));
vi.mock('agents', () => ({ getAgentByName: vi.fn(async () => conversation) }));
vi.mock('./conversation/conversation.js', () => ({ Conversation: vi.fn() }));

const env = { PL_SERVICE_TOKEN: 'test-token' } as Env;
const createdConversationSchema = z.object({ id: z.uuid() });
const UUID = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

function request(path: string, method = 'POST', token = env.PL_SERVICE_TOKEN) {
  return new Request(`https://agent.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }) as Parameters<typeof worker.fetch>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAgentByName).mockClear();
  conversation.fetch.mockReset().mockImplementation(async () => Response.json([]));
});

describe('conversation creation', () => {
  it('initializes conversations with distinct routable IDs', async () => {
    const first = await worker.fetch(request('/conversations'), env);
    const second = await worker.fetch(request('/conversations'), env);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstConversation = createdConversationSchema.parse(await first.json());
    const secondConversation = createdConversationSchema.parse(await second.json());
    expect(firstConversation.id).not.toBe(secondConversation.id);
    expect(parseRoute(`https://agent.test/conversations/${firstConversation.id}/chat`)).toEqual({
      conversationId: firstConversation.id,
      action: 'chat',
    });
    expect(getAgentByName).toHaveBeenNthCalledWith(1, env.Conversation, firstConversation.id);
    expect(getAgentByName).toHaveBeenNthCalledWith(2, env.Conversation, secondConversation.id);
  });

  it('waits for SDK startup before returning the ID', async () => {
    const initialized = Promise.withResolvers<undefined>();
    vi.mocked(getAgentByName).mockImplementationOnce(async () => {
      await initialized.promise;
      return conversation as Awaited<ReturnType<typeof getAgentByName>>;
    });
    let returned = false;
    const response = (async () => {
      const result = await worker.fetch(request('/conversations'), env);
      returned = true;
      return result;
    })();
    await vi.waitFor(() => expect(getAgentByName).toHaveBeenCalled());
    expect(returned).toBe(false);
    initialized.resolve(undefined);
    expect((await response).status).toBe(201);
  });

  it('does not return a conversation ID if SDK startup fails', async () => {
    vi.mocked(getAgentByName).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(worker.fetch(request('/conversations'), env)).rejects.toThrow(
      'storage unavailable',
    );
  });

  it('requires service authentication', async () => {
    expect((await worker.fetch(request('/conversations', 'POST', 'wrong-token'), env)).status).toBe(
      401,
    );
    expect(getAgentByName).not.toHaveBeenCalled();
  });

  it('does not create conversations for other HTTP methods', async () => {
    expect((await worker.fetch(request('/conversations', 'GET'), env)).status).toBe(404);
    expect(getAgentByName).not.toHaveBeenCalled();
  });
});

describe('conversation routing', () => {
  it.each([
    ['chat', 'POST', `/conversations/${UUID}/chat`],
    ['messages', 'GET', '/get-messages'],
  ])('forwards %s requests from the trusted caller', async (action, method, pathname) => {
    const response = await worker.fetch(request(`/conversations/${UUID}/${action}`, method), env);
    expect(response.status).toBe(200);
    expect(new URL(conversation.fetch.mock.lastCall![0].url).pathname).toBe(pathname);
  });
});
