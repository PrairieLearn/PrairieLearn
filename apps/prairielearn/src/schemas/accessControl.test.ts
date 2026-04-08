import { describe, expect, it } from 'vitest';

import { AccessControlJsonSchema } from './accessControl.js';

describe('AccessControlJsonSchema', () => {
  it('accepts explicit nulls used to clear inherited override fields', () => {
    const result = AccessControlJsonSchema.parse({
      dateControl: {
        // You cannot "clear" release date on overrides, it must be set to a value.
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
