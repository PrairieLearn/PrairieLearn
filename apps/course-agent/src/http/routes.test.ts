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
