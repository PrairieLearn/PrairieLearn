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
    date_control_after_last_deadline_credit_overridden: false,
    date_control_duration_minutes: null,
    date_control_duration_minutes_overridden: false,
    date_control_password: null,
    date_control_password_overridden: false,
    after_complete_hide_questions: null,
    after_complete_show_questions_again_date: null,
    after_complete_show_questions_again_date_overridden: false,
    after_complete_hide_questions_again_date: null,
    after_complete_hide_questions_again_date_overridden: false,
    after_complete_hide_score: null,
    after_complete_show_score_again_date: null,
    after_complete_show_score_again_date_overridden: false,
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
});
