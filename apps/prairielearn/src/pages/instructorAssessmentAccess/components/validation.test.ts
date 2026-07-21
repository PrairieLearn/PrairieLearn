import { describe, expect, it } from 'vitest';

import type { AccessControlFormData, OverrideData } from './types.js';
import {
  getAccessControlFormValidationErrors,
  getGlobalDateValidationErrors,
} from './validation.js';

const TEST_TIMEZONE = 'America/Chicago';

function makeOverride(partial: Partial<OverrideData> = {}): OverrideData {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    trackingId: 'override',
    appliesTo: {
      targetType: 'student_label',
      enrollments: [],
      studentLabels: [{ studentLabelId: '1', name: 'Section A' }],
    },
    overriddenFields: [],
    release: { date: null, released: true },
    due: { date: null, credit: null, customCredit: false },
    earlyDeadlines: [],
    lateDeadlines: [],
    afterLastDeadline: { allowSubmissions: false },
    durationMinutes: null,
    password: null,
    questionVisibility: { hidden: true },
    scoreVisibility: { hidden: false },
    ...partial,
  };
}

function makeFormData(
  overrides: AccessControlFormData['overrides'],
  defaultRuleOverrides: Partial<AccessControlFormData['defaultRule']> = {},
): AccessControlFormData {
  return {
    defaultRule: {
      trackingId: 'default',
      beforeReleaseListed: false,
      dateControlEnabled: true,
      release: { date: '2024-04-07T00:00:00', released: true },
      due: { date: '2024-04-10T00:00:00', credit: null, customCredit: false },
      earlyDeadlines: [],
      lateDeadlines: [],
      afterLastDeadline: { allowSubmissions: false },
      durationMinutes: null,
      password: null,
      prairieTestExams: [],
      questionVisibility: { hidden: true },
      scoreVisibility: { hidden: false },
      ...defaultRuleOverrides,
    },
    overrides,
  };
}

describe('getGlobalDateValidationErrors', () => {
  it('maps an impossible early deadline to the matching override field path', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([
        makeOverride({
          overriddenFields: ['release'],
          release: { date: '2024-04-06T00:00:00', released: true },
        }),
        makeOverride({
          appliesTo: {
            targetType: 'enrollment',
            enrollments: [{ enrollmentId: 'e1', uid: 'student1', name: 'Student 1' }],
            studentLabels: [],
          },
          overriddenFields: ['earlyDeadlines'],
          earlyDeadlines: [{ date: '2024-04-05T00:00:00', credit: 120 }],
        }),
      ]),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'overrides.1.earlyDeadlines.0.date',
      message: 'Early deadline must be after the earliest possible release date.',
    });
  });

  it('skips due-based global errors when any rule can unset the due date', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([
        makeOverride({ overriddenFields: ['due'] }),
        makeOverride({
          appliesTo: {
            targetType: 'student_label',
            enrollments: [],
            studentLabels: [{ studentLabelId: '2', name: 'Section B' }],
          },
          overriddenFields: ['lateDeadlines'],
          lateDeadlines: [{ date: '2024-04-07T12:00:00', credit: 50 }],
        }),
      ]),
      TEST_TIMEZONE,
    );

    expect(errors).toEqual([]);
  });

  it('flags a future release date when the radio choice is "Released"', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([], {
        release: { date: '2099-01-01T00:00:00', released: true },
        due: { date: '2099-02-01T00:00:00', credit: null, customCredit: false },
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.release.date',
      message: 'Release date must not be in the future when state is Released.',
    });
  });

  it('flags a past release date when the radio choice is "Scheduled for release"', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([], {
        release: { date: '2000-01-01T00:00:00', released: false },
        due: { date: '2000-02-01T00:00:00', credit: null, customCredit: false },
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.release.date',
      message: 'Release date must be in the future when scheduled for release.',
    });
  });

  it('flags a future override release date when override radio is "Released"', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([
        makeOverride({
          overriddenFields: ['release'],
          release: { date: '2099-01-01T00:00:00', released: true },
        }),
      ]),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'overrides.0.release.date',
      message: 'Release date must not be in the future when state is Released.',
    });
  });

  it('does not flag override release inconsistency when release is not overridden', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([
        makeOverride({
          overriddenFields: ['due'],
          release: { date: '2099-01-01T00:00:00', released: true },
          due: { date: '2099-06-01T00:00:00', credit: null, customCredit: false },
        }),
      ]),
      TEST_TIMEZONE,
    );

    expect(errors.find((e) => e.path === 'overrides.0.release.date')).toBeUndefined();
  });

  it('flags default late deadline credit above 100%', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([], {
        due: { date: '2024-04-10T00:00:00', credit: 110, customCredit: true },
        lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 101 }],
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.lateDeadlines.0.credit',
      message: 'Credit after the due date must be at most 100%.',
    });
  });

  it('reports independent early and late credit-ordering errors', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([], {
        earlyDeadlines: [
          { date: '2024-04-08T00:00:00', credit: 110 },
          { date: '2024-04-09T00:00:00', credit: 110 },
        ],
        lateDeadlines: [
          { date: '2024-04-11T00:00:00', credit: 100 },
          { date: '2024-04-12T00:00:00', credit: 100 },
        ],
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.earlyDeadlines.1.credit',
      message: 'Credit must strictly decrease over time.',
    });
    expect(errors).toContainEqual({
      path: 'defaultRule.lateDeadlines.1.credit',
      message: 'Credit must strictly decrease over time.',
    });
  });

  it('reports multiple inherited credit-ordering errors on an override', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData(
        [
          makeOverride({
            overriddenFields: ['lateDeadlines'],
            lateDeadlines: [
              { date: '2024-04-11T00:00:00', credit: 90 },
              { date: '2024-04-12T00:00:00', credit: 60 },
            ],
          }),
        ],
        {
          due: { date: '2024-04-10T00:00:00', credit: 80, customCredit: true },
          afterLastDeadline: { allowSubmissions: true, credit: 70 },
        },
      ),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'overrides.0.lateDeadlines.0.credit',
      message: 'Credit must strictly decrease over time.',
    });
    expect(errors).toContainEqual({
      path: 'overrides.0.lateDeadlines.1.credit',
      message: 'Credit must strictly decrease over time.',
    });
  });

  it('allows after-complete overrides without an automatic completion mechanism', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData(
        [
          makeOverride({
            overriddenFields: ['questionVisibility', 'scoreVisibility'],
            questionVisibility: { hidden: false },
            scoreVisibility: { hidden: false },
          }),
        ],
        {
          dateControlEnabled: false,
          due: { date: null, credit: null, customCredit: false },
        },
      ),
      TEST_TIMEZONE,
    );

    expect(errors).toEqual([]);
  });

  it('maps inherited after-complete conflicts to an active override field', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData(
        [
          makeOverride({
            overriddenFields: ['scoreVisibility'],
            scoreVisibility: { hidden: true },
          }),
        ],
        {
          questionVisibility: { hidden: false },
        },
      ),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'overrides.0.scoreVisibility',
      message: 'The score cannot be hidden after completion while questions are visible.',
    });
    expect(errors.find((e) => e.path === 'overrides.0.questionVisibility')).toBeUndefined();
  });

  it('does not map inherited after-complete conflicts to inactive override fields', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([makeOverride()], {
        questionVisibility: { hidden: false },
        scoreVisibility: { hidden: true },
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.questionVisibility',
      message: 'Questions cannot be made visible after completion while the score is hidden.',
    });
    expect(errors.find((e) => e.path === 'overrides.0.questionVisibility')).toBeUndefined();
    expect(errors.find((e) => e.path === 'overrides.0.scoreVisibility')).toBeUndefined();
  });
});

describe('getAccessControlFormValidationErrors', () => {
  it.each([101, 200])('allows early deadline form credit at %i%%', (credit) => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData([], {
        earlyDeadlines: [{ date: '2024-04-09T00:00:00', credit }],
      }),
      TEST_TIMEZONE,
    );

    expect(
      errors.find((error) => error.path === 'defaultRule.earlyDeadlines.0.credit'),
    ).toBeUndefined();
  });

  it.each([100, 201])('rejects early deadline form credit at %i%%', (credit) => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData([], {
        earlyDeadlines: [{ date: '2024-04-09T00:00:00', credit }],
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.earlyDeadlines.0.credit',
      message: 'Early deadline credit must be 101-200%',
    });
  });

  it('reports ordering errors independently of post-due range errors', () => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData([], {
        earlyDeadlines: [
          { date: '2024-04-08T00:00:00', credit: 110 },
          { date: '2024-04-09T00:00:00', credit: 110 },
        ],
        lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 105 }],
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.earlyDeadlines.1.credit',
      message: 'Credit must strictly decrease over time.',
    });
    expect(errors).toContainEqual({
      path: 'defaultRule.lateDeadlines.0.credit',
      message: 'Credit after the due date must be 0-100%',
    });
  });

  it('allows 100% in either first post-due form field', () => {
    const lateDeadlineErrors = getAccessControlFormValidationErrors(
      makeFormData([], {
        lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 100 }],
      }),
      TEST_TIMEZONE,
    );
    const afterDueErrors = getAccessControlFormValidationErrors(
      makeFormData([], {
        afterLastDeadline: { allowSubmissions: true, credit: 100 },
      }),
      TEST_TIMEZONE,
    );

    expect(
      lateDeadlineErrors.find((error) => error.path === 'defaultRule.lateDeadlines.0.credit'),
    ).toBeUndefined();
    expect(
      afterDueErrors.find((error) => error.path === 'defaultRule.afterLastDeadline.credit'),
    ).toBeUndefined();
  });

  it('rejects post-due form values above 100%', () => {
    const lateDeadlineErrors = getAccessControlFormValidationErrors(
      makeFormData([], {
        lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 101 }],
      }),
      TEST_TIMEZONE,
    );
    const afterDueErrors = getAccessControlFormValidationErrors(
      makeFormData([], {
        afterLastDeadline: { allowSubmissions: true, credit: 101 },
      }),
      TEST_TIMEZONE,
    );

    expect(lateDeadlineErrors).toContainEqual({
      path: 'defaultRule.lateDeadlines.0.credit',
      message: 'Credit after the due date must be 0-100%',
    });
    expect(afterDueErrors).toContainEqual({
      path: 'defaultRule.afterLastDeadline.credit',
      message: 'Credit after the due date must be 0-100%',
    });
  });

  it('validates default rule fields independently of mounted editors', () => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData([makeOverride()], {
        prairieTestExams: [
          {
            examUuid: '',
            readOnly: false,
            afterCompleteQuestionsHidden: false,
            afterCompleteScoreHidden: false,
          },
        ],
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.prairieTestExams.0.examUuid',
      message: 'Exam UUID is required',
    });
  });

  it('does not skip default after-complete date validation without an automatic completion mechanism', () => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData([], {
        dateControlEnabled: false,
        due: { date: null, credit: null, customCredit: false },
        questionVisibility: { hidden: true, visibleFromDate: '' },
        scoreVisibility: { hidden: true, visibleFromDate: '' },
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.questionVisibility.visibleFromDate',
      message: 'Date is required',
    });
    expect(errors).toContainEqual({
      path: 'defaultRule.scoreVisibility.visibleFromDate',
      message: 'Date is required',
    });
  });

  it('ignores invalid values for inactive override fields', () => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData([
        makeOverride({
          overriddenFields: [],
          durationMinutes: 0,
          password: '',
        }),
      ]),
      TEST_TIMEZONE,
    );

    expect(errors.find((e) => e.path.startsWith('overrides.0.'))).toBeUndefined();
  });

  it('validates invalid values for active override fields', () => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData([
        makeOverride({
          overriddenFields: ['durationMinutes', 'password'],
          durationMinutes: 0,
          password: '',
        }),
      ]),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'overrides.0.durationMinutes',
      message: 'Duration must be at least 1 minute',
    });
    expect(errors).toContainEqual({
      path: 'overrides.0.password',
      message: 'Password is required',
    });
  });
});
