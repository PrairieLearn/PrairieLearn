import { describe, expect, it } from 'vitest';

import { parseLocalDateTime } from './timezones.js';

describe('parseLocalDateTime', () => {
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
