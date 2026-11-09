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
    expect(CHECKPOINTS.list).toHaveBeenCalledWith({
      prefix: `uploads/${conversationId}/`,
      delimiter: '/',
    });
    expect(CHECKPOINTS.put).toHaveBeenCalledTimes(1);
  });
});

describe('attachment downloads', () => {
  const conversationId = crypto.randomUUID();
  const uploadId = crypto.randomUUID();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const svg = new TextEncoder().encode('<svg onload="alert(1)"/>');

  function request(path: string, objects: Record<string, Uint8Array>, init: RequestInit = {}) {
    const stored = (key: string) => {
      const bytes = objects[key];
      if (!bytes) return null;
      return {
        body: new Blob([bytes]).stream(),
        size: bytes.length,
        arrayBuffer: async () => bytes,
      };
    };
    const CHECKPOINTS = {
      get: vi.fn(async (key: string) => stored(key)),
      head: vi.fn(async (key: string) => stored(key)),
      put: vi.fn(async (key: string, body: ReadableStream) => {
        objects[key] = new Uint8Array(await new Response(body).arrayBuffer());
      }),
    };
    const response = app.request(
      `/conversations/${conversationId}/uploads/${path}`,
      { ...init, headers: { Authorization: 'Bearer test-token', ...init.headers } },
      { PL_SERVICE_TOKEN: 'test-token', CHECKPOINTS } as unknown as Env,
    );
    return { response, CHECKPOINTS };
  }

  it('always downloads an upload, even an image', async () => {
    const response = await request(uploadId, {
      [`uploads/${conversationId}/${uploadId}`]: png,
    }).response;
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.get('Content-Disposition')).toBe('attachment');
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  });

  it('stores a thumbnail only for an existing upload, and serves only images', async () => {
    const objects: Record<string, Uint8Array> = {};
    const put = (body: Uint8Array) =>
      request(`${uploadId}/thumbnail`, objects, {
        method: 'POST',
        headers: { 'Content-Length': String(body.length) },
        body,
      });

    const missing = put(png);
    expect((await missing.response).status).toBe(404);
    expect(missing.CHECKPOINTS.put).not.toHaveBeenCalled();

    objects[`uploads/${conversationId}/${uploadId}`] = png;
    expect((await put(png).response).status).toBe(204);
    const thumbnail = await request(`${uploadId}/thumbnail`, objects).response;
    expect(thumbnail.headers.get('Content-Type')).toBe('image/png');

    expect((await put(svg).response).status).toBe(204);
    expect((await request(`${uploadId}/thumbnail`, objects).response).status).toBe(404);
  });

  it('rejects an upload ID that is not a UUID before reading the bucket', async () => {
    for (const path of ['not-a-uuid', '..%2Fother/thumbnail']) {
      const { response, CHECKPOINTS } = request(path, {});
      expect((await response).status).toBe(404);
      expect(CHECKPOINTS.get).not.toHaveBeenCalled();
    }
  });
});
