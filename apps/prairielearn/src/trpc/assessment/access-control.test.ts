import { describe, expect, it } from 'vitest';

import { formJsonToEnrollmentRuleData } from './access-control.js';

describe('formJsonToEnrollmentRuleData', () => {
  it('normalizes omitted afterLastDeadline to inherited submissions behavior', () => {
    const result = formJsonToEnrollmentRuleData({ dateControl: {} });

    expect(result.afterLastDeadlineAllowSubmissions).toBeNull();
    expect(result.afterLastDeadlineCredit).toBeNull();
  });

  it('normalizes null afterLastDeadline to disabled submissions', () => {
    const result = formJsonToEnrollmentRuleData({
      dateControl: {
        afterLastDeadline: null,
      },
    });

    expect(result.afterLastDeadlineAllowSubmissions).toBe(false);
    expect(result.afterLastDeadlineCredit).toBeNull();
  });

  it('preserves afterLastDeadline submissions with credit', () => {
    const result = formJsonToEnrollmentRuleData({
      dateControl: {
        afterLastDeadline: { allowSubmissions: true, credit: 25 },
      },
    });

    expect(result.afterLastDeadlineAllowSubmissions).toBe(true);
    expect(result.afterLastDeadlineCredit).toBe(25);
  });
});
