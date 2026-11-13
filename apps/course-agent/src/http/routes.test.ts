import { getAgentByName } from 'agents';
import { describe, expect, it, vi } from 'vitest';

import { MAX_CONVERSATION_ATTACHMENTS } from '@prairielearn/course-agent-types';

import { UploadQuota } from '../conversation/attachments.js';

import app from './routes.js';

vi.mock('agents', () => ({ getAgentByName: vi.fn() }));
vi.mock('../monitoring.js', () => ({ reportError: vi.fn() }));

describe('private course agent service', () => {
  it('rejects an unauthorized request before looking up a conversation', async () => {
    const response = await app.request(
      '/conversations',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      },
      { PL_SERVICE_TOKEN: 'test-token' } as Env,
    );
    expect(response.status).toBe(401);
    expect(getAgentByName).not.toHaveBeenCalled();
  });

  it('accepts the previous token during rotation', async () => {
    const response = await app.request(
      '/conversations/local',
      { method: 'POST', headers: { Authorization: 'Bearer old-token' } },
      { PL_SERVICE_TOKEN: 'new-token', PL_SERVICE_TOKEN_PREVIOUS: 'old-token' } as Partial<Env>,
    );
    expect(response.status).toBe(400);
  });
});

describe('uploads', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  /** Upload a file to a conversation that already holds `stored` uploads. */
  function upload(stored: number) {
    const conversationId = crypto.randomUUID();
    const quota = new UploadQuota(async () => ({ count: stored, bytes: 0 }));
    vi.mocked(getAgentByName).mockResolvedValue({
      reserveUpload: (size: number) => quota.reserve(size),
      releaseUpload: (size: number) => quota.release(size),
    } as unknown as Awaited<ReturnType<typeof getAgentByName>>);
    const bucket = new Map<string, Uint8Array>();
    const CHECKPOINTS = {
      put: async (key: string, body: ReadableStream) => {
        bucket.set(key, new Uint8Array(await new Response(body).arrayBuffer()));
      },
    };
    const response = app.request(
      `/conversations/${conversationId}/uploads`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Length': String(bytes.length) },
        body: bytes,
      },
      { PL_SERVICE_TOKEN: 'test-token', CHECKPOINTS } as unknown as Env,
    );
    return { conversationId, response, bucket };
  }

  it('stores an uploaded file under the ID it returns', async () => {
    const { conversationId, response, bucket } = upload(0);
    const { id } = await (await response).json<{ id: string }>();
    expect(bucket.get(`uploads/${conversationId}/${id}`)).toEqual(bytes);
  });

  it('refuses an upload to a full conversation', async () => {
    const { response, bucket } = upload(MAX_CONVERSATION_ATTACHMENTS);
    expect((await response).status).toBe(413);
    expect(bucket.size).toBe(0);
  });
});
