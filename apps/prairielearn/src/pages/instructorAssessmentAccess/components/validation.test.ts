import { describe, expect, it } from 'vitest';

import {
  MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE,
  MAX_ACCESS_CONTROL_STUDENT_LABELS_PER_RULE,
  MAX_ENROLLMENT_ACCESS_CONTROL_RULES,
  MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES,
} from '../../../schemas/accessControl.js';

import type { AccessControlFormData, OverrideData } from './types.js';
import {
  getAccessControlFormValidationErrors,
  getGlobalDateValidationErrors,
} from './validation.js';

const TEST_TIMEZONE = 'America/Chicago';

function makeOverride(partial: Partial<OverrideData> = {}): OverrideData {
  return {
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
      afterLastDeadline: null,
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

function makeEnrollments(count: number): OverrideData['appliesTo']['enrollments'] {
  return Array.from({ length: count }, (_, i) => ({
    enrollmentId: String(i),
    uid: `student${i}`,
    name: `Student ${i}`,
  }));
}

function makeStudentLabels(count: number): OverrideData['appliesTo']['studentLabels'] {
  return Array.from({ length: count }, (_, i) => ({
    studentLabelId: String(i),
    name: `Section ${i}`,
  }));
}

function makeEnrollmentAppliesTo(
  enrollments: OverrideData['appliesTo']['enrollments'],
): OverrideData['appliesTo'] {
  return {
    targetType: 'enrollment',
    enrollments,
    studentLabels: [],
  };
}

function makeStudentLabelAppliesTo(
  studentLabels: OverrideData['appliesTo']['studentLabels'],
): OverrideData['appliesTo'] {
  return {
    targetType: 'student_label',
    enrollments: [],
    studentLabels,
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
          appliesTo: makeEnrollmentAppliesTo(makeEnrollments(1)),
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
          appliesTo: makeStudentLabelAppliesTo(makeStudentLabels(1)),
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

  it('flags default late deadline credit at 100%', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([], {
        due: { date: '2024-04-10T00:00:00', credit: 110, customCredit: true },
        lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 100 }],
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.lateDeadlines.0.credit',
      message: 'Credit after the due date must be less than 100%.',
    });
  });

  it('flags default after-last-deadline credit at 100%', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([], {
        due: { date: '2024-04-10T00:00:00', credit: 110, customCredit: true },
        afterLastDeadline: { allowSubmissions: true, credit: 100 },
      }),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'defaultRule.afterLastDeadline.credit',
      message: 'Credit after the due date must be less than 100%.',
    });
  });

  it('maps after-complete mechanism errors to visible override fields', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData(
        [
          makeOverride({
            overriddenFields: ['questionVisibility', 'scoreVisibility'],
            questionVisibility: { hidden: false },
            scoreVisibility: { hidden: true },
          }),
        ],
        {
          dateControlEnabled: false,
          due: { date: null, credit: null, customCredit: false },
        },
      ),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'overrides.0.questionVisibility',
      message: 'After-complete settings require a deadline, duration limit, or PrairieTest exam.',
    });
    expect(errors).toContainEqual({
      path: 'overrides.0.scoreVisibility',
      message: 'After-complete settings require a deadline, duration limit, or PrairieTest exam.',
    });
    expect(errors.find((e) => e.path === 'overrides.0.questionVisibility.visibleFromDate')).toBe(
      undefined,
    );
    expect(errors.find((e) => e.path === 'overrides.0.scoreVisibility.visibleFromDate')).toBe(
      undefined,
    );
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
      message: 'The score cannot be hidden after completion while questions are visible.',
    });
    expect(errors.find((e) => e.path === 'overrides.0.questionVisibility')).toBeUndefined();
    expect(errors.find((e) => e.path === 'overrides.0.scoreVisibility')).toBeUndefined();
  });
});

describe('getAccessControlFormValidationErrors', () => {
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

  it('does not validate hidden default after-complete date inputs without a completion mechanism', () => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData([], {
        dateControlEnabled: false,
        due: { date: null, credit: null, customCredit: false },
        questionVisibility: { hidden: true, visibleFromDate: '' },
        scoreVisibility: { hidden: true, visibleFromDate: '' },
      }),
      TEST_TIMEZONE,
    );

    expect(
      errors.find(
        (e) =>
          e.path === 'defaultRule.questionVisibility.visibleFromDate' ||
          e.path === 'defaultRule.scoreVisibility.visibleFromDate',
      ),
    ).toBeUndefined();
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

  it.each([
    {
      name: 'student-label overrides',
      limit: MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES,
      makeTargetedOverride: () => makeOverride(),
      message: `At most ${MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES} student-label overrides are allowed. Remove 1 student-label override before saving.`,
    },
    {
      name: 'enrollment rules',
      limit: MAX_ENROLLMENT_ACCESS_CONTROL_RULES,
      makeTargetedOverride: () =>
        makeOverride({
          appliesTo: makeEnrollmentAppliesTo([]),
        }),
      message: `At most ${MAX_ENROLLMENT_ACCESS_CONTROL_RULES} student-specific overrides are allowed. Remove 1 student-specific override before saving.`,
    },
  ])('validates the maximum number of $name', ({ limit, makeTargetedOverride, message }) => {
    const errors = getAccessControlFormValidationErrors(
      makeFormData(Array.from({ length: limit + 1 }, makeTargetedOverride)),
      TEST_TIMEZONE,
    );

    expect(errors).toContainEqual({
      path: 'overrides.root',
      message,
    });
  });

  it.each([
    {
      name: 'student labels',
      override: makeOverride({
        appliesTo: makeStudentLabelAppliesTo(
          makeStudentLabels(MAX_ACCESS_CONTROL_STUDENT_LABELS_PER_RULE + 1),
        ),
      }),
      message: `At most ${MAX_ACCESS_CONTROL_STUDENT_LABELS_PER_RULE} student labels can be selected.`,
    },
    {
      name: 'students',
      override: makeOverride({
        appliesTo: makeEnrollmentAppliesTo(
          makeEnrollments(MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE + 1),
        ),
      }),
      message: `At most ${MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE} students can be selected.`,
    },
  ])('validates the maximum number of $name per override', ({ override, message }) => {
    const errors = getAccessControlFormValidationErrors(makeFormData([override]), TEST_TIMEZONE);

    expect(errors).toContainEqual({
      path: 'overrides.0.appliesTo.root',
      message,
    });
  });
});
