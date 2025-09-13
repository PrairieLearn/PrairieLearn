import { describe, expect, it } from 'vitest';

import { type Timezone, formatTimezone } from './timezone.shared.js';

describe('formatTimezone', () => {
  it('formats positive hour and minute offsets', () => {
    const tz: Timezone = {
      name: 'Europe/Berlin',
      utc_offset: { hours: 2, minutes: 30 },
    };
    expect(formatTimezone(tz)).toBe('(UTC 2:30) Europe/Berlin');
  });

  it('formats negative hour and minute offsets', () => {
    const tz: Timezone = {
      name: 'America/Chicago',
      utc_offset: { hours: -5, minutes: -45 },
    };
    expect(formatTimezone(tz)).toBe('(UTC -5:45) America/Chicago');
  });

  it('formats zero hour and minute offsets', () => {
    const tz: Timezone = {
      name: 'UTC',
      utc_offset: { hours: 0, minutes: 0 },
    };
    expect(formatTimezone(tz)).toBe('(UTC 00:00) UTC');
  });

  it('formats missing minutes as 00', () => {
    const tz: Timezone = {
      name: 'Asia/Kolkata',
      utc_offset: { hours: 5 },
    };
    expect(formatTimezone(tz)).toBe('(UTC 5:00) Asia/Kolkata');
  });

  it('formats missing hours as 00', () => {
    const tz: Timezone = {
      name: 'Etc/GMT',
      utc_offset: { minutes: 15 },
    };
    expect(formatTimezone(tz)).toBe('(UTC 00:15) Etc/GMT');
  });

  it('formats negative hour with positive minutes', () => {
    const tz: Timezone = {
      name: 'America/St_Johns',
      utc_offset: { hours: -3, minutes: 30 },
    };
    expect(formatTimezone(tz)).toBe('(UTC -3:30) America/St_Johns');
  });
});
