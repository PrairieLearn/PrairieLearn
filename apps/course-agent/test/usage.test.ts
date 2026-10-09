import { expect, test } from 'vitest';

import { accumulateUsage } from '../src/usage.js';

const initial = { model: 'test', version: 0, input: 0, cached: 0, cacheWrite: 0, output: 0 };
const native = { threadId: 'thread', input: 100, cached: 20, cacheWrite: 30, output: 10 };

test('normalizes repeated, stale and new-thread cumulative counters', () => {
  const first = accumulateUsage(initial, undefined, native)!;
  expect(first).toMatchObject({ input: 100, cached: 20, cacheWrite: 30, output: 10 });
  expect(accumulateUsage(first, native, native)).toMatchObject({
    ...first,
    version: first.version + 1,
  });
  expect(accumulateUsage(first, native, { ...native, input: 50 })).toBeUndefined();
  expect(accumulateUsage(first, native, { ...native, threadId: 'new' })).toMatchObject({
    input: 200,
    output: 20,
  });
});
test('restoring an older native baseline retains already-spent lifetime usage', () => {
  const lifetime = { ...initial, version: 3, input: 150, cached: 30, cacheWrite: 45, output: 15 };
  const after = accumulateUsage(lifetime, native, {
    threadId: 'thread',
    input: 120,
    cached: 25,
    cacheWrite: 35,
    output: 12,
  });
  expect(after).toMatchObject({ input: 170, cached: 35, cacheWrite: 50, output: 17 });
});
