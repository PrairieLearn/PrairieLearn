import { describe, expect, it, vi } from 'vitest';

import { proxyOpenAiRequest } from './provider.js';

describe('model-provider credential broker', () => {
  it('injects the credential only for the placeholder messages request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response('ok'));
    const response = await proxyOpenAiRequest(
      new Request('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: 'Bearer proxy-injected' },
        body: '{}',
      }),
      { OPENAI_API_KEY: 'worker-only-secret' },
      fetchImplementation,
    );
    expect(response.status).toBe(200);
    const forwarded = fetchImplementation.mock.calls[0][0] as Request;
    expect(forwarded.headers.get('authorization')).toBe('Bearer worker-only-secret');
  });

  it('rejects arbitrary requests that do not carry the placeholder', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const response = await proxyOpenAiRequest(
      new Request('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: 'Bearer attacker-selected' },
        body: '{}',
      }),
      { OPENAI_API_KEY: 'worker-only-secret' },
      fetchImplementation,
    );
    expect(response.status).toBe(403);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
