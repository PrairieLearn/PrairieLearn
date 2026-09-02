import { describe, expect, it, vi } from 'vitest';

import { proxyAnthropicRequest } from './provider.js';

describe('model-provider credential broker', () => {
  it('injects the credential only for the placeholder messages request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response('ok'));
    const response = await proxyAnthropicRequest(
      new Request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': 'proxy-injected' },
        body: '{}',
      }),
      { ANTHROPIC_API_KEY: 'worker-only-secret' },
      fetchImplementation,
    );
    expect(response.status).toBe(200);
    const forwarded = fetchImplementation.mock.calls[0][0] as Request;
    expect(forwarded.headers.get('x-api-key')).toBe('worker-only-secret');
  });

  it('rejects arbitrary requests that do not carry the placeholder', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const response = await proxyAnthropicRequest(
      new Request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': 'attacker-selected' },
        body: '{}',
      }),
      { ANTHROPIC_API_KEY: 'worker-only-secret' },
      fetchImplementation,
    );
    expect(response.status).toBe(403);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
