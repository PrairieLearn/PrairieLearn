import { describe, expect, it } from 'vitest';

import { formJsonToEnrollmentRuleData } from './access-control.js';

describe('formJsonToEnrollmentRuleData', () => {
  it('maps omitted afterLastDeadline to inherited submissions behavior', () => {
    const result = formJsonToEnrollmentRuleData({ dateControl: {} });

    expect(result.afterLastDeadlineAllowSubmissions).toBeNull();
    expect(result.afterLastDeadlineCredit).toBeNull();
  });

  it('maps allowSubmissions false to disabled submissions', () => {
    const result = formJsonToEnrollmentRuleData({
      dateControl: {
        afterLastDeadline: { allowSubmissions: false },
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
