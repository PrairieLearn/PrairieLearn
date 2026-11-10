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

describe('attachment thumbnails', () => {
  const conversationId = crypto.randomUUID();
  const uploadId = crypto.randomUUID();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const svg = new TextEncoder().encode('<svg onload="alert(1)"/>');

  interface Stored {
    bytes: Uint8Array;
    contentType?: string;
  }

  function request(path: string, objects: Record<string, Stored>, init: RequestInit = {}) {
    const stored = (key: string) => {
      const object = objects[key];
      if (!object) return null;
      return {
        body: new Blob([object.bytes]).stream(),
        httpMetadata: { contentType: object.contentType },
      };
    };
    const CHECKPOINTS = {
      get: vi.fn(async (key: string) => stored(key)),
      head: vi.fn(async (key: string) => stored(key)),
      put: vi.fn(
        async (
          key: string,
          bytes: Uint8Array,
          options: { httpMetadata: { contentType: string } },
        ) => {
          objects[key] = { bytes, contentType: options.httpMetadata.contentType };
        },
      ),
    };
    const response = app.request(
      `/conversations/${conversationId}/uploads/${path}`,
      { ...init, headers: { Authorization: 'Bearer test-token', ...init.headers } },
      { PL_SERVICE_TOKEN: 'test-token', CHECKPOINTS } as unknown as Env,
    );
    return { response, CHECKPOINTS };
  }

  it('stores only an image thumbnail of an existing upload, with its type', async () => {
    const objects: Record<string, Stored> = {};
    const post = (body: Uint8Array) =>
      request(`${uploadId}/thumbnail`, objects, {
        method: 'POST',
        headers: { 'Content-Length': String(body.length) },
        body,
      });

    const missing = post(png);
    expect((await missing.response).status).toBe(404);
    expect(missing.CHECKPOINTS.put).not.toHaveBeenCalled();

    objects[`uploads/${conversationId}/${uploadId}`] = { bytes: png };
    const script = post(svg);
    expect((await script.response).status).toBe(415);
    expect(script.CHECKPOINTS.put).not.toHaveBeenCalled();

    expect((await post(png).response).status).toBe(204);
    const thumbnail = await request(`${uploadId}/thumbnail`, objects).response;
    expect(thumbnail.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await thumbnail.arrayBuffer())).toEqual(png);
  });

  it('rejects an upload ID that is not a UUID before reading the bucket', async () => {
    for (const path of ['not-a-uuid', '..%2Fother/thumbnail']) {
      const { response, CHECKPOINTS } = request(path, {});
      expect((await response).status).toBe(404);
      expect(CHECKPOINTS.get).not.toHaveBeenCalled();
    }
  });
});
