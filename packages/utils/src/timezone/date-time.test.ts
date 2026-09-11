import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { getAdjacentDates, getStartOfDayInTimezone, parseDateTimeInTimezone } from './index.js';

describe('parseDateTimeInTimezone', () => {
  it.each([
    '2026/09/01 13:00',
    'Sep 1, 2026 13:00',
    'September 1,2026 13:00',
    'sEp 1 2026 1:00 PM',
    '2026-09-01 13:00:00Z',
    '2026-09-01T13:00:00+02:30',
    '2026-09-01 13:00 -0700',
  ])('interprets %s as civil time in the supplied timezone', (input) => {
    expect(parseDateTimeInTimezone(input, 'America/Chicago', 'later').toISOString()).toBe(
      '2026-09-01T18:00:00.000Z',
    );
  });

  it.each([
    '2026/02/29 13:00',
    'September 31, 2026 13:00',
    'NotAMonth 1, 2026 13:00',
    '2026-09-01 13:00:00Z trailing',
    '2026-09-01 13:00+99:99',
    '2026-09-01 24:01',
    '2026-09-01 0:00 PM',
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

  it('accepts a date with a single-digit hour', () => {
    const date = parseDateTimeInTimezone('2022-01-03 1:00', 'America/Chicago', 'later');

    expect(date.toISOString()).toBe('2022-01-03T07:00:00.000Z');
  });

  it('accepts a native datetime-local value', () => {
    const date = parseDateTimeInTimezone('2030-01-15T14:30', 'America/Chicago', 'later');

    expect(date.toISOString()).toBe('2030-01-15T20:30:00.000Z');
  });

  it('accepts repeated whitespace between the date and time', () => {
    const date = parseDateTimeInTimezone('2022-01-03  \t 1:00', 'America/Chicago', 'later');

    expect(date.toISOString()).toBe('2022-01-03T07:00:00.000Z');
  });

  it('normalizes 24:00 to midnight on the following day', () => {
    const date = parseDateTimeInTimezone('2022-01-03 24:00', 'America/Chicago', 'later');

    expect(date.toISOString()).toBe('2022-01-04T06:00:00.000Z');
  });

  it('accepts PostgreSQL-compatible AM/PM times', () => {
    const afternoon = parseDateTimeInTimezone('2026-09-01 1:00 PM', 'America/Chicago', 'later');
    const midnight = parseDateTimeInTimezone('2026-09-01 12:00 AM', 'America/Chicago', 'later');

    expect(afternoon.toISOString()).toBe('2026-09-01T18:00:00.000Z');
    expect(midnight.toISOString()).toBe('2026-09-01T05:00:00.000Z');
  });

  it('accepts common spreadsheet date and time formats', () => {
    const unpadded = parseDateTimeInTimezone('2026-8-7 1:2 PM', 'America/Chicago', 'later');
    const usDate = parseDateTimeInTimezone('08/07/2026 1:02 PM', 'America/Chicago', 'later');
    const shortYear = parseDateTimeInTimezone('8/7/26 1:02 PM', 'America/Chicago', 'later');

    expect(unpadded.toISOString()).toBe('2026-08-07T18:02:00.000Z');
    expect(usDate.toISOString()).toBe('2026-08-07T18:02:00.000Z');
    expect(shortYear.toISOString()).toBe('2026-08-07T18:02:00.000Z');
  });

  it('rejects trailing input', () => {
    expect(() => parseDateTimeInTimezone('2026-09-01 1:00 unexpected', 'UTC', 'later')).toThrow();
  });

  it('rejects leap seconds instead of silently shifting them', () => {
    expect(() => parseDateTimeInTimezone('2016-12-31 23:59:60', 'UTC', 'later')).toThrow();
  });

  it('chooses the later instant for ambiguous fall-back times', () => {
    const date = parseDateTimeInTimezone('2025-11-02 01:30', 'America/Chicago', 'later');

    expect(date.toISOString()).toBe('2025-11-02T07:30:00.000Z');
  });

  it('moves nonexistent spring-forward times forward across the gap', () => {
    const date = parseDateTimeInTimezone('2025-03-09 02:30', 'America/Chicago', 'later');

    expect(date.toISOString()).toBe('2025-03-09T08:30:00.000Z');
  });

  it.skipIf((process.versions.tz ?? '') < '2026b')(
    'parses British Columbia dates using the application timezone data',
    () => {
      const date = parseDateTimeInTimezone('2026-11-02 16:30', 'America/Vancouver', 'later');

      expect(date.toISOString()).toBe('2026-11-02T23:30:00.000Z');
    },
  );
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
      ['2026-09-04', '2026-09-01', '2026-09-02', '2026-09-04'],
      '2026-09-02',
    );
    expect(previousDate?.toString()).toBe('2026-09-01');
    expect(nextDate?.toString()).toBe('2026-09-04');
  });

  it('handles missing adjacent dates', () => {
    expect(getAdjacentDates([], '2026-09-02')).toEqual({
      previousDate: null,
      nextDate: null,
    });
    const dates = ['2026-09-02'];
    expect(getAdjacentDates(dates, '2026-09-01').previousDate).toBeNull();
    expect(getAdjacentDates(dates, '2026-09-01').nextDate?.toString()).toBe('2026-09-02');
    expect(getAdjacentDates(dates, '2026-09-03').previousDate?.toString()).toBe('2026-09-02');
    expect(getAdjacentDates(dates, '2026-09-03').nextDate).toBeNull();
  });
});
