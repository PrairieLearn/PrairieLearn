import { describe, expect, it } from 'vitest';

import { type RawLegacyAssessmentAuthzResult, formatLegacyAssessmentAccess } from './legacy.js';

describe('formatLegacyAssessmentAccess', () => {
  it('formats raw access timestamps in the course instance timezone', () => {
    const raw: RawLegacyAssessmentAuthzResult = {
      access_rules: [
        {
          credit: 100,
          time_limit_min: 60,
          start_date: new Date('2025-01-02T06:30:00.000Z'),
          end_date: new Date('2025-01-02T07:30:00.000Z'),
          mode: 'Public',
          active: true,
        },
      ],
      access_timeline: [],
      active: true,
      authorized: true,
      credit: 100,
      credit_end_date: new Date('2025-01-02T07:30:00.000Z'),
      exam_access_end: null,
      mode: 'Public',
      next_active_credit: null,
      next_active_date: null,
      password: null,
      show_before_release: false,
      show_closed_assessment: true,
      show_closed_assessment_score: true,
      staff_override: false,
      time_limit_min: 60,
    };

    const result = formatLegacyAssessmentAccess(raw, 'America/Chicago');

    expect(result.credit_date_string).toBe('100% until 01:30, Thu, Jan 2');
    expect(result.access_rules[0].start_date).toBe('2025-01-02 00:30:00-06 (CST)');
    expect(result.access_rules[0].end_date).toBe('2025-01-02 01:30:00-06 (CST)');
  });
});
