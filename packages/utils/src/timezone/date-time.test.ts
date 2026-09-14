import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { getAdjacentDates, getStartOfDayInTimezone, parseDateTimeInTimezone } from './index.js';

describe('parseDateTimeInTimezone', () => {
  it.each([
    '2026-09-01T13:00',
    '2026/09/01 13:00',
    '9/1/26 1:00 PM',
    '2026-9-1  \t 1:0 PM',
    'sEp 1, 26 13:00',
    '01-Sep-2026 13:00',
    '1 Sep 2026 13:00',
    'Tuesday, September 1, 2026 13:00',
    'Tue Sept 1 2026 13:00',
    '2026-09-01 13:00:00Z',
    '2026-09-01 13:00 UTC',
    '2026-09-01T13:00:00+02:30',
    '2026-09-01 13:00 -0700',
  ])('interprets %s as civil time in the supplied timezone', (input) => {
    expect(parseDateTimeInTimezone(input, 'America/Chicago', 'later').toISOString()).toBe(
      '2026-09-01T18:00:00.000Z',
    );
  });

  it.each(['1-Sep-26', '20260901'])('interprets %s as local midnight', (input) => {
    expect(parseDateTimeInTimezone(input, 'America/Chicago', 'later').toISOString()).toBe(
      '2026-09-01T05:00:00.000Z',
    );
  });

  it.each([
    ['1-Jan-69', '2069-01-01T00:00:00.000Z'],
    ['Jan 1, 70', '1970-01-01T00:00:00.000Z'],
    ['1-Jan-0069', '0069-01-01T00:00:00.000Z'],
  ])('expands only two-digit years in %s', (input, expected) => {
    expect(parseDateTimeInTimezone(input, 'UTC', 'later').toISOString()).toBe(expected);
  });

  it.each([
    '20260229',
    '1-Septober-26',
    'Funday, September 1, 2026',
    '2026-09-01 13:00 UTC trailing',
    '2026-09-01 13:00+99:99',
    '2026-09-01 24:01',
    '2026-09-01 0:00 PM',
    '2016-12-31 23:59:60',
  ])('rejects invalid input %s', (input) => {
    expect(() => parseDateTimeInTimezone(input, 'America/Chicago', 'later')).toThrow();
  });

  it('honors the caller disambiguation policy', () => {
    expect(
      parseDateTimeInTimezone('2025-11-02 01:30', 'America/Chicago', 'earlier').toISOString(),
    ).toBe('2025-11-02T06:30:00.000Z');
    expect(() =>
      parseDateTimeInTimezone('2025-03-09 02:30', 'America/Chicago', 'reject'),
    ).toThrow();
  });

  it.each([
    ['2026-09-01 12:00 AM', '2026-09-01T05:00:00.000Z'],
    ['2026-09-01 24:00', '2026-09-02T05:00:00.000Z'],
  ])('interprets midnight notation %s', (input, expected) => {
    expect(parseDateTimeInTimezone(input, 'America/Chicago', 'later').toISOString()).toBe(expected);
  });
});

describe('getStartOfDayInTimezone', () => {
  it('uses the first occurrence of midnight as the start of a calendar day', () => {
    const date = getStartOfDayInTimezone(Temporal.PlainDate.from('2025-11-02'), 'America/Havana');

    expect(date.toISOString()).toBe('2025-11-02T04:00:00.000Z');
  });

  it('uses the first valid instant when midnight does not exist', () => {
    const date = getStartOfDayInTimezone(Temporal.PlainDate.from('1919-03-31'), 'America/Toronto');

    expect(date.toISOString()).toBe('1919-03-31T04:30:00.000Z');
  });
});

describe('getAdjacentDates', () => {
  it('finds occupied dates around a day in an unsorted list with duplicates', () => {
    const { previousDate, nextDate } = getAdjacentDates(
      ['2026-09-05', '2026-09-01', '2026-09-03', '2026-09-02', '2026-09-04', '2026-09-02'],
      '2026-09-03',
    );
    expect(previousDate?.toString()).toBe('2026-09-02');
    expect(nextDate?.toString()).toBe('2026-09-04');
  });

  it('handles missing adjacent dates', () => {
    expect(getAdjacentDates([], '2026-09-02')).toEqual({
      previousDate: null,
      nextDate: null,
    });
    const beforeFirst = getAdjacentDates(['2026-09-02'], '2026-09-01');
    expect(beforeFirst.previousDate).toBeNull();
    expect(beforeFirst.nextDate?.toString()).toBe('2026-09-02');

    const afterLast = getAdjacentDates(['2026-09-02'], '2026-09-03');
    expect(afterLast.previousDate?.toString()).toBe('2026-09-02');
    expect(afterLast.nextDate).toBeNull();
  });
});
