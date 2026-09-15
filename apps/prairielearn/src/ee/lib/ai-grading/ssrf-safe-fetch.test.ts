import { describe, expect, it } from 'vitest';

import {
  UnsafeAiEndpointUrlError,
  assertSafeAiEndpointUrl,
  isBlockedIpAddress,
  normalizeAiEndpointBaseUrl,
} from './ssrf-safe-fetch.js';

describe('isBlockedIpAddress', () => {
  it('blocks loopback, private, and link-local addresses', () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('10.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('192.168.1.1')).toBe(true);
    expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);
    expect(isBlockedIpAddress('1.1.1.1')).toBe(false);
  });
});

describe('normalizeAiEndpointBaseUrl', () => {
  it('strips trailing slashes from HTTPS URLs', () => {
    expect(normalizeAiEndpointBaseUrl('https://llm.example.edu/v1/')).toBe(
      'https://llm.example.edu/v1',
    );
  });

  it('rejects non-HTTPS URLs', () => {
    expect(() => normalizeAiEndpointBaseUrl('http://llm.example.edu/v1')).toThrow(
      UnsafeAiEndpointUrlError,
    );
  });
});

describe('assertSafeAiEndpointUrl', () => {
  it('rejects localhost hostnames', async () => {
    await expect(assertSafeAiEndpointUrl('https://localhost/v1')).rejects.toThrow(
      UnsafeAiEndpointUrlError,
    );
  });

  it('rejects hostnames that resolve to private addresses', async () => {
    await expect(
      assertSafeAiEndpointUrl('https://internal.example.edu/v1', async () => [
        { address: '10.1.2.3', family: 4 },
      ]),
    ).rejects.toThrow(UnsafeAiEndpointUrlError);
  });

  it('accepts hostnames that resolve only to public addresses', async () => {
    const url = await assertSafeAiEndpointUrl('https://llm.example.edu/v1', async () => [
      { address: '8.8.8.8', family: 4 },
    ]);
    expect(url.hostname).toBe('llm.example.edu');
  });
});
