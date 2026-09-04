import { describe, expect, it } from 'vitest';

import { activeRunExpired, sandboxDeadline } from './lifecycle.js';

describe('activeRunExpired', () => {
  it('treats legacy state without an expiration as stale', () => {
    expect(activeRunExpired(undefined)).toBe(true);
  });

  it('expires a run at its deadline', () => {
    expect(
      activeRunExpired('2026-09-03T12:00:00.000Z', Date.parse('2026-09-03T12:00:00.000Z')),
    ).toBe(true);
  });

  it('keeps a run active before its deadline', () => {
    expect(
      activeRunExpired('2026-09-03T12:00:01.000Z', Date.parse('2026-09-03T12:00:00.000Z')),
    ).toBe(false);
  });
});

describe('absolute sandbox lifetime', () => {
  it('starts a new deadline in seconds and preserves it across turns', () => {
    expect(sandboxDeadline(null, true, 600, 1000)).toBe(601000);
    expect(sandboxDeadline(601000, false, 600, 300000)).toBe(601000);
    expect(sandboxDeadline(601000, true, 10, 700000)).toBe(710000);
  });
});
