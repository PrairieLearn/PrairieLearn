import { describe, expect, it } from 'vitest';

import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
import { Queue } from './queue.js';
import { validatePrefix } from './validation.js';
import { Worker } from './worker.js';

const redisUrl = 'redis://localhost:6379/';

function firstHashTag(key: string): string | undefined {
  const match = /\{([^{}]+)\}/.exec(key);
  return match?.[1];
}

describe('QueueKeys', () => {
  it('uses the prefix and queue name in the tagged base', () => {
    expect(new QueueKeys(DEFAULT_PREFIX, 'emails').base).toBe('prairiemq:{prairiemq:emails}');
    expect(new QueueKeys('tenant-1', 'emails').base).toBe('tenant-1:{tenant-1:emails}');
  });

  it('gives different queues different hash tags', () => {
    const emails = new QueueKeys(DEFAULT_PREFIX, 'emails');
    const reports = new QueueKeys(DEFAULT_PREFIX, 'reports');

    expect(firstHashTag(emails.base)).toBe('prairiemq:emails');
    expect(firstHashTag(reports.base)).toBe('prairiemq:reports');
    expect(firstHashTag(emails.base)).not.toBe(firstHashTag(reports.base));
  });

  it('keeps every representative key in the queue hash tag', () => {
    const keys = new QueueKeys(DEFAULT_PREFIX, 'emails');
    const tag = firstHashTag(keys.base);
    const dynamicId = 'id:{other}: value π';
    const physicalKeys = [
      keys.active,
      `${keys.base}:job:${dynamicId}`,
      `${keys.base}:group-wait:${dynamicId}`,
      `${keys.base}:lock:${dynamicId}`,
      `${keys.base}:fetch:${dynamicId}`,
    ];

    expect(tag).toBe('prairiemq:emails');
    expect(physicalKeys.map(firstHashTag)).toEqual(physicalKeys.map(() => tag));
  });
});

describe('queue prefix validation', () => {
  it.each(['tenant{one', 'tenant}one', 'tenant{one}'])(
    'rejects braces in Queue and Worker prefix %j',
    (prefix) => {
      expect(() => new Queue('emails', { redisUrl, prefix })).toThrow('prefix');
      expect(() => new Worker('emails', async () => undefined, { redisUrl, prefix })).toThrow(
        'prefix',
      );
    },
  );

  it('continues to allow Redis glob characters', () => {
    expect(() => validatePrefix('tenant:*?[]\\')).not.toThrow();
  });
});
