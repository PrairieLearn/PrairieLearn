import { describe, expect, it } from 'vitest';

import { AccessControlJsonInputSchema } from './trpc.js';

describe('AccessControlJsonInputSchema', () => {
  it('accepts explicit nulls used to clear inherited override fields', () => {
    const result = AccessControlJsonInputSchema.parse({
      dateControl: {
        releaseDate: null,
        dueDate: null,
        earlyDeadlines: null,
        lateDeadlines: null,
        afterLastDeadline: null,
        durationMinutes: null,
        password: null,
      },
    });

    expect(result.dateControl?.releaseDate).toBeNull();
    expect(result.dateControl?.afterLastDeadline).toBeNull();
    expect(result.dateControl?.durationMinutes).toBeNull();
  });
});
