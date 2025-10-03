import { describe, expect, it } from 'vitest';

import { withResolvers } from './index.js';

describe('withResolvers', () => {
  it('resolves with the correct value', async () => {
    const { promise, resolve } = withResolvers<number>();
    setTimeout(() => resolve(123), 10);
    await expect(promise).resolves.toBe(123);
  });

  it('rejects with the correct reason', async () => {
    const { promise, reject } = withResolvers<number>();
    setTimeout(() => reject(new Error('fail')), 10);
    await expect(promise).rejects.toThrow('fail');
  });
});
