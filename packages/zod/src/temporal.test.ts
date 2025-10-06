import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { zInstant } from './temporal.js';

describe('Temporal Zod Schemas', () => {
  it('should validate Temporal.Instant', () => {
    const validInstant = Temporal.Instant.from('2023-01-01T00:00:00Z');
    const result = zInstant.safeParse(validInstant);
    expect(result.success).toBe(true);
  });
  it('should validate Temporal.Instant coming from the database', () => {
    const inputString = '2025-10-13 11:15:48-05';
    const validInstant = Temporal.Instant.from(inputString);
    const result = zInstant.safeParse(inputString);
    expect(result.success).toBe(true);
    expect(result.data!.toString()).toBe(validInstant.toString());
  });
  it('should invalidate Temporal.Instant', () => {
    const inputString = 'invalid-instant';
    const result = zInstant.safeParse(inputString);
    expect(result.success).toBe(false);
  });
});
