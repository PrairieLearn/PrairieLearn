import { describe, expect, it, vi } from 'vitest';

import { proxyCourseDataRequest } from './course-data.js';

describe('course-data outbound proxy', () => {
  it('forwards only the structured path and substitutes the signed capability', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response('{}'));
    const request = new Request('https://course-data.internal/query', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sandbox-placeholder',
        Cookie: 'should-not-forward=true',
      },
      body: JSON.stringify({ resource: 'students', select: ['student.uid'] }),
    });

    await proxyCourseDataRequest(
      request,
      {
        capability: 'signed-run-capability',
        callbackOrigin: 'http://127.0.0.1:3000',
      },
      fetchImplementation,
    );

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [destination, init] = fetchImplementation.mock.calls[0];
    expect(destination.toString()).toBe(
      'http://127.0.0.1:3000/pl/webhooks/course-agent/data/query',
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer signed-run-capability');
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('rejects routes outside the semantic data API without forwarding', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response('{}'));

    const response = await proxyCourseDataRequest(
      new Request('https://course-data.internal/arbitrary-sql', { method: 'POST' }),
      {
        capability: 'signed-run-capability',
        callbackOrigin: 'http://127.0.0.1:3000',
      },
      fetchImplementation,
    );

    expect(response.status).toBe(405);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
