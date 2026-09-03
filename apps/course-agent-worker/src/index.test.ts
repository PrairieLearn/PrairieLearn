import { describe, expect, it } from 'vitest';

import { activeRunExpired } from './lifecycle.js';

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
