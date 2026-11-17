import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  formatTimezone,
  getCanonicalTimezones,
  getLocalDate,
  getTimezoneByName,
  plainDateTimeToDate,
} from './index.js';

describe('formatTimezone', () => {
  it('formats positive hour and minute offsets', () => {
    expect(
      formatTimezone({
        name: 'Europe/Berlin',
        utc_offset: (2 * 60 + 30) * 60 * 1000,
      }),
    ).toBe('(UTC 2:30) Europe/Berlin');
  });

  it('formats negative hour and minute offsets', () => {
    expect(
      formatTimezone({
        name: 'America/Chicago',
        utc_offset: -(5 * 60 + 45) * 60 * 1000,
      }),
    ).toBe('(UTC -5:45) America/Chicago');
  });

  it('formats zero hour and minute offsets', () => {
    expect(formatTimezone({ name: 'UTC', utc_offset: 0 })).toBe('(UTC 00:00) UTC');
  });

  it('formats positive whole-hour offsets', () => {
    expect(formatTimezone({ name: 'Asia/Kolkata', utc_offset: 5 * 60 * 60 * 1000 })).toBe(
      '(UTC 5:00) Asia/Kolkata',
    );
  });

  it('formats positive sub-hour offsets', () => {
    expect(formatTimezone({ name: 'Etc/GMT', utc_offset: 15 * 60 * 1000 })).toBe(
      '(UTC 00:15) Etc/GMT',
    );
  });

  it('formats negative fractional-hour offsets', () => {
    expect(
      formatTimezone({
        name: 'America/St_Johns',
        utc_offset: -(3 * 60 + 30) * 60 * 1000,
      }),
    ).toBe('(UTC -3:30) America/St_Johns');
  });
});

describe('plainDateTimeToDate', () => {
  it.skipIf((process.versions.tz ?? '') < '2026b')(
    'uses the server timezone data for Vancouver wall-clock times',
    () => {
      const result = plainDateTimeToDate(
        Temporal.PlainDateTime.from('2026-11-02T16:30:00'),
        'America/Vancouver',
        'later',
      );

      expect(result.toISOString()).toBe('2026-11-02T23:30:00.000Z');
    },
  );

  it('chooses the later instant for ambiguous fall-back times', () => {
    const result = plainDateTimeToDate(
      Temporal.PlainDateTime.from('2025-11-02T01:30:00'),
      'America/Chicago',
      'later',
    );

    expect(result.toISOString()).toBe('2025-11-02T07:30:00.000Z');
  });

  it('moves nonexistent spring-forward times forward across the gap', () => {
    const result = plainDateTimeToDate(
      Temporal.PlainDateTime.from('2025-03-09T02:30:00'),
      'America/Chicago',
      'later',
    );

    expect(result.toISOString()).toBe('2025-03-09T08:30:00.000Z');
  });
});

describe('local calendar helpers', () => {
  it('gets the local date', () => {
    const instant = new Date('2025-03-09T12:00:00.000Z');
    expect(getLocalDate(instant, 'America/Chicago').toString()).toBe('2025-03-09');

    const previousLocalDate = new Date('2025-03-09T04:00:00.000Z');
    expect(getLocalDate(previousLocalDate, 'America/Chicago').toString()).toBe('2025-03-08');
  });
});

describe('timezone catalog', () => {
  it('gets offsets from the server runtime at a specified instant', () => {
    const at = new Date('2026-07-03T00:30:00.000Z');

    expect(getTimezoneByName('America/Vancouver', at)).toEqual({
      name: 'America/Vancouver',
      utc_offset: -7 * 60 * 60 * 1000,
    });
  });

  it('retains supported aliases that are already in use', () => {
    const timezones = getCanonicalTimezones({
      alwaysInclude: ['US/Central', 'Not/A_Timezone'],
    });

    expect(timezones.some(({ name }) => name === 'US/Central')).toBe(true);
    expect(timezones.some(({ name }) => name === 'Not/A_Timezone')).toBe(false);
  });

  it('rejects names unsupported by the server runtime', () => {
    expect(() => getTimezoneByName('Not/A_Timezone')).toThrow(
      'Timezone "Not/A_Timezone" is not supported by the server runtime',
    );
  });
});
