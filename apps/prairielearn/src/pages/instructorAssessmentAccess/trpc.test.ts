import { describe, expect, it } from 'vitest';

import {
  AccessControlJsonInputSchema,
  formJsonToEnrollmentRuleData,
} from '../../trpc/assessment/access-control.js';

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

describe('formJsonToEnrollmentRuleData', () => {
  it('preserves explicit afterLastDeadline: null', () => {
    const result = formJsonToEnrollmentRuleData({
      dateControl: {
        afterLastDeadline: null,
      },
    });

    expect(result.afterLastDeadlineOverridden).toBe(true);
    expect(result.afterLastDeadlineAllowSubmissions).toBeNull();
    expect(result.afterLastDeadlineCreditOverridden).toBe(false);
    expect(result.afterLastDeadlineCredit).toBeNull();
  });

  it('preserves practice-submissions afterLastDeadline', () => {
    const result = formJsonToEnrollmentRuleData({
      dateControl: {
        afterLastDeadline: { allowSubmissions: true },
      },
    });

    expect(result.afterLastDeadlineOverridden).toBe(true);
    expect(result.afterLastDeadlineAllowSubmissions).toBe(true);
    expect(result.afterLastDeadlineCreditOverridden).toBe(false);
    expect(result.afterLastDeadlineCredit).toBeNull();
  });
});
