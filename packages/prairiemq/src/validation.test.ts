import { describe, expect, it } from 'vitest';

import { normalizeRedisUrl } from './validation.js';

describe('normalizeRedisUrl', () => {
  it('normalizes a Redis URL without changing its connection details', () => {
    expect(normalizeRedisUrl('REDISS://user:p%40ss@[::1]:6380/4')).toBe(
      'rediss://user:p%40ss@[::1]:6380/4',
    );
  });

  it.each(['redis://host', 'redis://host/', 'redis://host/0', 'redis://host/123'])(
    'accepts the database path in %s',
    (redisUrl) => {
      expect(normalizeRedisUrl(redisUrl)).toBe(redisUrl);
    },
  );

  it.each([
    'redis://host/0?autoResendUnfulfilledCommands=true',
    'redis://host?',
    'redis://host/0#fragment',
    'redis://host#',
    'redis://host/1foo',
    'redis://host/1/2',
  ])('rejects unsafe or ambiguous connection details in %s', (redisUrl) => {
    expect(() => normalizeRedisUrl(redisUrl)).toThrow('redisUrl');
  });
});
