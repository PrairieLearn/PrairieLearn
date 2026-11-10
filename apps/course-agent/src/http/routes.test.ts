import { getAgentByName } from 'agents';
import { describe, expect, it, vi } from 'vitest';

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

  it('stores an upload only within its reservation, and returns the room if storing fails', async () => {
    const conversation = { reserveUpload: vi.fn(), releaseUpload: vi.fn() };
    vi.mocked(getAgentByName).mockResolvedValue(
      conversation as unknown as Awaited<ReturnType<typeof getAgentByName>>,
    );
    const CHECKPOINTS = { put: vi.fn() };
    const upload = () =>
      app.request(
        `/conversations/${crypto.randomUUID()}/uploads`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-token', 'Content-Length': '3' },
          body: new Uint8Array(3),
        },
        { PL_SERVICE_TOKEN: 'test-token', CHECKPOINTS } as unknown as Env,
      );

    conversation.reserveUpload.mockResolvedValue(false);
    expect((await upload()).status).toBe(413);
    expect(CHECKPOINTS.put).not.toHaveBeenCalled();

    conversation.reserveUpload.mockResolvedValue(true);
    CHECKPOINTS.put.mockRejectedValueOnce(new Error('R2 unavailable'));
    expect((await upload()).status).toBe(500);
    expect(conversation.releaseUpload).toHaveBeenCalledWith(3);

    expect((await upload()).status).toBe(201);
    expect(conversation.reserveUpload).toHaveBeenLastCalledWith(3);
    expect(conversation.releaseUpload).toHaveBeenCalledTimes(1);
  });
});
