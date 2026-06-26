import { describe, expect, it } from 'vitest';

import { getAssessmentInstanceTimeLimit } from './assessment.shared.js';

describe('getAssessmentInstanceTimeLimit', () => {
  const reqDate = new Date('2026-01-01T12:00:00Z');
  const date = new Date('2026-01-01T11:00:00Z');

  it('is untimed when there is neither an exam access end nor a date limit', () => {
    expect(
      getAssessmentInstanceTimeLimit({ examAccessEnd: null, date, dateLimit: null, reqDate }),
    ).toEqual({
      assessment_instance_remaining_ms: null,
      assessment_instance_time_limit_ms: null,
      assessment_instance_time_limit_expired: false,
    });
  });

  it('uses the exam access end when there is no date limit (CBTF exam)', () => {
    // A PrairieTest reservation governs timing and the instance has no
    // date_limit. This is the case that was broken for modern access control.
    const examAccessEnd = new Date('2026-01-01T12:30:00Z');
    expect(
      getAssessmentInstanceTimeLimit({ examAccessEnd, date, dateLimit: null, reqDate }),
    ).toEqual({
      assessment_instance_remaining_ms: 30 * 60 * 1000,
      assessment_instance_time_limit_ms: 90 * 60 * 1000,
      assessment_instance_time_limit_expired: false,
    });
  });

  it('uses the date limit when there is no exam access end', () => {
    const dateLimit = new Date('2026-01-01T12:30:00Z');
    expect(
      getAssessmentInstanceTimeLimit({ examAccessEnd: null, date, dateLimit, reqDate }),
    ).toEqual({
      assessment_instance_remaining_ms: 30 * 60 * 1000,
      assessment_instance_time_limit_ms: 90 * 60 * 1000,
      assessment_instance_time_limit_expired: false,
    });
  });

  it('uses the earlier of the exam access end and the date limit', () => {
    const earlier = new Date('2026-01-01T12:20:00Z');
    const later = new Date('2026-01-01T12:40:00Z');
    expect(
      getAssessmentInstanceTimeLimit({ examAccessEnd: later, date, dateLimit: earlier, reqDate }),
    ).toMatchObject({ assessment_instance_remaining_ms: 20 * 60 * 1000 });
    expect(
      getAssessmentInstanceTimeLimit({ examAccessEnd: earlier, date, dateLimit: later, reqDate }),
    ).toMatchObject({ assessment_instance_remaining_ms: 20 * 60 * 1000 });
  });

  it('reports a negative remaining time once the effective end has passed', () => {
    const examAccessEnd = new Date('2026-01-01T11:30:00Z');
    expect(
      getAssessmentInstanceTimeLimit({ examAccessEnd, date, dateLimit: null, reqDate }),
    ).toMatchObject({ assessment_instance_remaining_ms: -30 * 60 * 1000 });
  });

  it('marks the time limit expired only once date_limit is at or before the request date', () => {
    // Boundary: date_limit exactly equal to req_date is expired (SQL used `<=`).
    expect(
      getAssessmentInstanceTimeLimit({
        examAccessEnd: null,
        date,
        dateLimit: new Date(reqDate),
        reqDate,
      }).assessment_instance_time_limit_expired,
    ).toBe(true);

    expect(
      getAssessmentInstanceTimeLimit({
        examAccessEnd: null,
        date,
        dateLimit: new Date('2026-01-01T11:59:59Z'),
        reqDate,
      }).assessment_instance_time_limit_expired,
    ).toBe(true);

    expect(
      getAssessmentInstanceTimeLimit({
        examAccessEnd: null,
        date,
        dateLimit: new Date('2026-01-01T12:00:01Z'),
        reqDate,
      }).assessment_instance_time_limit_expired,
    ).toBe(false);

    // An exam access end alone never expires the time limit; only date_limit does.
    expect(
      getAssessmentInstanceTimeLimit({
        examAccessEnd: new Date('2026-01-01T11:00:00Z'),
        date,
        dateLimit: null,
        reqDate,
      }).assessment_instance_time_limit_expired,
    ).toBe(false);
  });

  it('has no time limit duration when the instance has no start date', () => {
    expect(
      getAssessmentInstanceTimeLimit({
        examAccessEnd: new Date('2026-01-01T12:30:00Z'),
        date: null,
        dateLimit: null,
        reqDate,
      }),
    ).toMatchObject({
      assessment_instance_remaining_ms: 30 * 60 * 1000,
      assessment_instance_time_limit_ms: null,
    });
  });
});
