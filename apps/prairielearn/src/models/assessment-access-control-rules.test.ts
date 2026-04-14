import { describe, expect, it } from 'vitest';

import { dbRowToAccessControlJson } from './assessment-access-control-rules.js';

function makeBaseRule(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    assessment_id: '100',
    number: 0,
    target_type: 'none' as const,
    list_before_release: null,
    date_control_release_date: null,
    date_control_due_date: null,
    date_control_due_date_overridden: false,
    date_control_early_deadlines_overridden: false,
    date_control_late_deadlines_overridden: false,
    date_control_after_last_deadline_allow_submissions: null,
    date_control_after_last_deadline_credit: null,
    date_control_duration_minutes: null,
    date_control_duration_minutes_overridden: false,
    date_control_password: null,
    date_control_password_overridden: false,
    after_complete_questions_hidden: null,
    after_complete_questions_visible_from_date: null,
    after_complete_questions_visible_until_date: null,
    after_complete_score_hidden: null,
    after_complete_score_visible_from_date: null,
    ...overrides,
  };
}

function makeRow(
  overrides: {
    rule?: Record<string, unknown>;
    labels?: { id: string; name: string; color: string }[] | null;
    enrollments?: { enrollment_id: string; uid: string; name: string | null }[] | null;
    early_deadlines?: { date: string; credit: number }[] | null;
    late_deadlines?: { date: string; credit: number }[] | null;
    prairietest_exams?: { uuid: string; read_only: boolean }[] | null;
  } = {},
) {
  return {
    access_control_rule: makeBaseRule(overrides.rule),
    labels: overrides.labels ?? null,
    enrollments: overrides.enrollments ?? null,
    early_deadlines: overrides.early_deadlines ?? null,
    late_deadlines: overrides.late_deadlines ?? null,
    prairietest_exams: overrides.prairietest_exams ?? null,
  };
}

describe('dbRowToAccessControlJson', () => {
  it('omits integrations when prairietest_exams is an empty array', () => {
    const result = dbRowToAccessControlJson(makeRow({ prairietest_exams: [] }));
    expect(result.integrations).toBeUndefined();
  });

  it('omits integrations when prairietest_exams is null', () => {
    const result = dbRowToAccessControlJson(makeRow({ prairietest_exams: null }));
    expect(result.integrations).toBeUndefined();
  });

  it('includes integrations when prairietest_exams has entries', () => {
    const result = dbRowToAccessControlJson(
      makeRow({
        prairietest_exams: [{ uuid: 'abc-123', read_only: false }],
      }),
    );
    expect(result.integrations).toEqual({
      prairieTest: {
        exams: [{ examUuid: 'abc-123', readOnly: false }],
      },
    });
  });

  it('omits afterComplete questions when hidden is null', () => {
    const result = dbRowToAccessControlJson(
      makeRow({
        rule: {
          after_complete_questions_hidden: null,
          after_complete_questions_visible_from_date: new Date('2025-03-01T00:00:00Z'),
        },
      }),
    );

    expect(result.afterComplete?.questions).toBeUndefined();
  });

  it('omits afterComplete score when hidden is null', () => {
    const result = dbRowToAccessControlJson(
      makeRow({
        rule: {
          after_complete_score_hidden: null,
          after_complete_score_visible_from_date: new Date('2025-03-01T00:00:00Z'),
        },
      }),
    );

    expect(result.afterComplete?.score).toBeUndefined();
  });

  it('omits credit for main rule afterLastDeadline when not set', () => {
    const result = dbRowToAccessControlJson(
      makeRow({
        rule: {
          date_control_after_last_deadline_allow_submissions: false,
        },
      }),
    );

    expect(result.dateControl?.afterLastDeadline).toEqual({
      allowSubmissions: false,
    });
  });

  it('omits credit for override afterLastDeadline when submissions disabled', () => {
    const result = dbRowToAccessControlJson(
      makeRow({
        rule: {
          target_type: 'student_label',
          number: 1,
          date_control_after_last_deadline_allow_submissions: false,
        },
      }),
    );

    expect(result.dateControl?.afterLastDeadline).toEqual({
      allowSubmissions: false,
    });
  });

  it('reconstructs afterComplete questions as simple hidden: true', () => {
    const result = dbRowToAccessControlJson(
      makeRow({
        rule: {
          after_complete_questions_hidden: true,
        },
      }),
    );

    expect(result.afterComplete?.questions).toEqual({ hidden: true });
  });

  it('reconstructs afterComplete score as simple hidden: true', () => {
    const result = dbRowToAccessControlJson(
      makeRow({
        rule: {
          after_complete_score_hidden: true,
        },
      }),
    );

    expect(result.afterComplete?.score).toEqual({ hidden: true });
  });
});
