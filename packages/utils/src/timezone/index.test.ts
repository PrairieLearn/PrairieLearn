import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  getCanonicalTimezones,
  getLocalDate,
  getLocalDayBounds,
  getTimezoneByName,
  plainDateTimeToDate,
} from './index.js';

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
  it('gets the local date and DST-aware UTC bounds of a local day', () => {
    const instant = new Date('2025-03-09T12:00:00.000Z');
    expect(getLocalDate(instant, 'America/Chicago').toString()).toBe('2025-03-09');

    const bounds = getLocalDayBounds(Temporal.PlainDate.from('2025-03-09'), 'America/Chicago');
    expect(bounds.start.toISOString()).toBe('2025-03-09T06:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2025-03-10T05:00:00.000Z');
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
