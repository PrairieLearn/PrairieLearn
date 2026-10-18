import { getAgentByName } from 'agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Env } from './env.js';
import { parseRoute } from './http/routes.js';
import worker from './worker.js';

vi.mock('agents', () => ({ getAgentByName: vi.fn() }));
vi.mock('./conversation/conversation.js', () => ({ Conversation: vi.fn() }));

const env = { PL_SERVICE_TOKEN: 'test-token' } as Env;
const createdConversationSchema = z.object({ id: z.uuid() });

function createRequest(method = 'POST', token = env.PL_SERVICE_TOKEN) {
  return new Request('https://agent.test/conversations', {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }) as Parameters<typeof worker.fetch>[0];
}

beforeEach(() => vi.clearAllMocks());

describe('conversation ID creation', () => {
  it('issues distinct routable IDs without initializing Durable Objects', async () => {
    const first = await worker.fetch(createRequest(), env);
    const second = await worker.fetch(createRequest(), env);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstConversation = createdConversationSchema.parse(await first.json());
    const secondConversation = createdConversationSchema.parse(await second.json());
    expect(firstConversation.id).not.toBe(secondConversation.id);
    expect(parseRoute(`https://agent.test/conversations/${firstConversation.id}/chat`)).toEqual({
      conversationId: firstConversation.id,
      action: 'chat',
    });
    expect(getAgentByName).not.toHaveBeenCalled();
  });

  it('requires service authentication', async () => {
    expect((await worker.fetch(createRequest('POST', 'wrong-token'), env)).status).toBe(401);
    expect(getAgentByName).not.toHaveBeenCalled();
  });

  it('does not issue IDs for other HTTP methods', async () => {
    expect((await worker.fetch(createRequest('GET'), env)).status).toBe(404);
    expect(getAgentByName).not.toHaveBeenCalled();
  });
});
