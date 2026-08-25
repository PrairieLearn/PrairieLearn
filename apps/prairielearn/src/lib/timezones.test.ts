import { describe, expect, it } from 'vitest';

import { formatDateYMDHM } from '@prairielearn/formatter';
import type { Timezone } from '@prairielearn/utils/timezone';

import { formatTimezone } from './timezone.shared.js';
import { parseLocalDateTime } from './timezones.js';

describe('formatTimezone', () => {
  it('formats positive hour and minute offsets', () => {
    const tz: Timezone = {
      name: 'Europe/Berlin',
      utc_offset: (2 * 60 + 30) * 60 * 1000,
    };
    expect(formatTimezone(tz)).toBe('(UTC 2:30) Europe/Berlin');
  });

  it('formats negative hour and minute offsets', () => {
    const tz: Timezone = {
      name: 'America/Chicago',
      utc_offset: -(5 * 60 + 45) * 60 * 1000,
    };
    expect(formatTimezone(tz)).toBe('(UTC -5:45) America/Chicago');
  });

  it('formats zero hour and minute offsets', () => {
    const tz: Timezone = {
      name: 'UTC',
      utc_offset: 0,
    };
    expect(formatTimezone(tz)).toBe('(UTC 00:00) UTC');
  });

  it('formats positive whole-hour offsets', () => {
    const tz: Timezone = {
      name: 'Asia/Kolkata',
      utc_offset: 5 * 60 * 60 * 1000,
    };
    expect(formatTimezone(tz)).toBe('(UTC 5:00) Asia/Kolkata');
  });

  it('formats positive sub-hour offsets', () => {
    const tz: Timezone = {
      name: 'Etc/GMT',
      utc_offset: 15 * 60 * 1000,
    };
    expect(formatTimezone(tz)).toBe('(UTC 00:15) Etc/GMT');
  });

  it('formats negative fractional-hour offsets', () => {
    const tz: Timezone = {
      name: 'America/St_Johns',
      utc_offset: -(3 * 60 + 30) * 60 * 1000,
    };
    expect(formatTimezone(tz)).toBe('(UTC -3:30) America/St_Johns');
  });
});

describe('parseLocalDateTime', () => {
  it.skipIf((process.versions.tz ?? '') < '2026b')(
    'uses the server timezone data for Vancouver wall-clock times',
    () => {
      const instant = parseLocalDateTime('2026-11-02 16:30:00', 'America/Vancouver');
      expect(instant.toISOString()).toBe('2026-11-02T23:30:00.000Z');
      expect(formatDateYMDHM(instant, 'America/Vancouver')).toBe('2026-11-02 16:30');
      expect(formatDateYMDHM(new Date('2026-11-03T00:30:00.000Z'), 'America/Vancouver')).toBe(
        '2026-11-02 17:30',
      );
    },
  );

  it('chooses the later instant for ambiguous fall-back times', () => {
    expect(parseLocalDateTime('2025-11-02 01:30:00', 'America/Chicago').toISOString()).toBe(
      '2025-11-02T07:30:00.000Z',
    );
  });

  it('moves nonexistent spring-forward times forward across the gap', () => {
    expect(parseLocalDateTime('2025-03-09 02:30:00', 'America/Chicago').toISOString()).toBe(
      '2025-03-09T08:30:00.000Z',
    );
  });

  it('matches the legacy parser handling of fractional seconds and suffixes', () => {
    expect(parseLocalDateTime('2025-01-02T03:04:05.999Z', 'UTC').toISOString()).toBe(
      '2025-01-02T03:04:05.000Z',
    );
  });
});
