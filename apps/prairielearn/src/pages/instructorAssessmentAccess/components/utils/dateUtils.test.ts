import { describe, expect, it } from 'vitest';

import type { DeadlineEntry } from '../types.js';

import { getDeadlineRange } from './dateUtils.js';

function deadline(date: string, credit = 100): DeadlineEntry {
  return { date, credit };
}

describe('getDeadlineRange', () => {
  it('returns null when deadline is undefined', () => {
    expect(getDeadlineRange('2024-04-01T00:00:00', undefined)).toBeNull();
  });

  it('returns null when deadline has no date', () => {
    expect(getDeadlineRange('2024-04-01T00:00:00', deadline(''))).toBeNull();
  });

  it('uses rangeStart as start when provided', () => {
    const range = getDeadlineRange('2024-04-01T00:00:01', deadline('2024-04-10T23:59:59'));
    expect(range).toEqual({
      start: new Date('2024-04-01T00:00:01'),
      end: new Date('2024-04-10T23:59:59'),
    });
  });

  it('returns null start when rangeStart is null', () => {
    const range = getDeadlineRange(null, deadline('2024-04-10T23:59:59'));
    expect(range).toEqual({
      start: null,
      end: new Date('2024-04-10T23:59:59'),
    });
  });

  it('returns null start when rangeStart is undefined', () => {
    const range = getDeadlineRange(undefined, deadline('2024-04-10T23:59:59'));
    expect(range).toEqual({
      start: null,
      end: new Date('2024-04-10T23:59:59'),
    });
  });
});
