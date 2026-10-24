import { getAgentByName } from 'agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import worker from './worker.js';

const conversation = vi.hoisted(() => ({
  getPendingReview: vi.fn(async () => null),
  recordReviewOutcome: vi.fn(async () => true),
  fetch: vi.fn<(request: Request) => Promise<Response>>(),
}));
const lookupConversation = vi.hoisted(() =>
  vi.fn<() => Promise<{ fetch: (request: Request) => Promise<Response> }>>(),
);
vi.mock('agents', () => ({ getAgentByName: lookupConversation }));
vi.mock('@cloudflare/sandbox', () => ({ DirectoryBackupGateway: vi.fn() }));
vi.mock('./sandbox.js', () => ({ CourseSandbox: vi.fn(), CourseAgentOutbound: vi.fn() }));
vi.mock('./conversation/conversation.js', () => ({ Conversation: vi.fn() }));

const env = { PL_SERVICE_TOKEN: 'test-token' } as Env;
const UUID = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

function request(path: string, method = 'POST', token = env.PL_SERVICE_TOKEN) {
  return new Request(`https://agent.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }) as Parameters<typeof worker.fetch>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupConversation.mockReset().mockResolvedValue(conversation);
  conversation.fetch.mockReset().mockImplementation(async () => Response.json([]));
});

describe('conversation creation', () => {
  it('requires service authentication', async () => {
    expect((await worker.fetch(request('/conversations', 'POST', 'wrong-token'), env)).status).toBe(
      401,
    );
    expect(getAgentByName).not.toHaveBeenCalled();
  });
});

describe('conversation routing', () => {
  it.each([`/conversations/${UUID}`, `/conversations/${UUID}/get-messages`])(
    'forwards native SDK route %s from the trusted caller',
    async (pathname) => {
      const response = await worker.fetch(request(pathname, 'GET'), env);
      expect(response.status).toBe(200);
      expect(new URL(conversation.fetch.mock.lastCall![0].url).pathname).toBe(pathname);
    },
  );
  it('dispatches authenticated review routes and rejects stale outcomes', async () => {
    expect(
      (await worker.fetch(request(`/conversations/${UUID}/pending-review`, 'GET'), env)).status,
    ).toBe(200);
    expect(conversation.getPendingReview).toHaveBeenCalledOnce();
    const callback = new Request(
      `https://agent.test/conversations/${UUID}/pending-review/outcome`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PL_SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callId: 'call',
          revision: 'a'.repeat(64),
          result: {
            decision: 'denied',
            publication: { status: 'not_attempted' },
            sync: { status: 'not_attempted' },
          },
        }),
      },
    ) as Parameters<typeof worker.fetch>[0];
    conversation.recordReviewOutcome.mockResolvedValueOnce(false);
    expect((await worker.fetch(callback, env)).status).toBe(409);
    expect(conversation.fetch).not.toHaveBeenCalled();
  });
});
