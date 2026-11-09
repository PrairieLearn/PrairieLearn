import { getAgentByName } from 'agents';
import { describe, expect, it, vi } from 'vitest';

import { MAX_ATTACHMENT_BYTES } from '@prairielearn/course-agent-types';

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

  it('refuses an upload that would take a conversation over 200 MB', async () => {
    const conversationId = crypto.randomUUID();
    // 180 MB and one byte.
    const objects = [
      ...Array.from({ length: 9 }, () => ({ size: MAX_ATTACHMENT_BYTES })),
      { size: 1 },
    ];
    const CHECKPOINTS = { list: vi.fn(async () => ({ objects })), put: vi.fn() };
    const upload = (size: number) =>
      app.request(
        `/conversations/${conversationId}/uploads`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-token', 'Content-Length': String(size) },
          body: new Uint8Array(size),
        },
        { PL_SERVICE_TOKEN: 'test-token', CHECKPOINTS } as unknown as Env,
      );

    expect((await upload(MAX_ATTACHMENT_BYTES)).status).toBe(413);
    expect((await upload(MAX_ATTACHMENT_BYTES - 1)).status).toBe(201);
    expect(CHECKPOINTS.list).toHaveBeenCalledWith({ prefix: `uploads/${conversationId}/` });
    expect(CHECKPOINTS.put).toHaveBeenCalledTimes(1);
  });
});
