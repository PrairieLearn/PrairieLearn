import { Redis } from 'ioredis';
import { afterEach, expect, test, vi } from 'vitest';

import { withConfig } from '../../../tests/utils/config.js';

import { closeEvents, notify } from './events.js';

afterEach(async () => {
  await closeEvents();
  vi.restoreAllMocks();
});

test('subscription failure disconnects both clients and permits a clean retry', async () => {
  vi.spyOn(Redis.prototype, 'connect').mockResolvedValue(undefined);
  vi.spyOn(Redis.prototype, 'subscribe')
    .mockRejectedValueOnce(new Error('Subscription rejected'))
    .mockResolvedValue(1);
  const disconnect = vi.spyOn(Redis.prototype, 'disconnect').mockImplementation(() => {});
  vi.spyOn(Redis.prototype, 'publish').mockResolvedValue(1);
  await withConfig({ redisUrl: 'redis://localhost:6379' }, async () => {
    await expect(notify('test')).rejects.toThrow('Subscription rejected');
    expect(disconnect).toHaveBeenCalledTimes(2);
    await notify('test');
    await closeEvents();
    expect(disconnect).toHaveBeenCalledTimes(4);
  });
});
