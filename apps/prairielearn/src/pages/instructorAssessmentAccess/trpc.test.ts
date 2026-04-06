import { describe, expect, it } from 'vitest';

import { AccessControlJsonInputSchema } from '../../trpc/assessment/access-control.js';

describe('AccessControlJsonInputSchema', () => {
  it('accepts explicit nulls used to clear inherited override fields', () => {
    const result = AccessControlJsonInputSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: null,
        earlyDeadlines: null,
        lateDeadlines: null,
        afterLastDeadline: null,
        durationMinutes: null,
        password: null,
      },
    });

    expect(result.dateControl?.releaseDate).toBe('2024-03-14T00:01:00');
    expect(result.dateControl?.afterLastDeadline).toBeNull();
    expect(result.dateControl?.durationMinutes).toBeNull();
  });
});
