import { expect, it } from 'vitest';

import { estimatedCost } from '../ee/lib/course-agent/usage.js';

// Native totals are a read-only display projection. Financial admission and
// settlement are exercised against Redis and signed HTTP in their own suites.
it('distinguishes an unpriced conversation from zero usage and prices each native category', () => {
  const usage = {
    version: 1,
    model: 'fixture',
    input: 1000,
    cached: 200,
    cacheWrite: 100,
    output: 100,
  };
  const price = { input: 2, cachedInput: 0.5, cacheWrite: 3, output: 10 };
  expect(estimatedCost(usage, price)).toBeCloseTo(0.0028);
  expect(estimatedCost(usage, undefined)).toBeNull();
  expect(estimatedCost({ ...usage, input: 0, cached: 0, cacheWrite: 0, output: 0 }, price)).toBe(0);
  expect(estimatedCost({ ...usage, prices: price }, { ...price, output: 99 })).toBeCloseTo(0.0028);
});
