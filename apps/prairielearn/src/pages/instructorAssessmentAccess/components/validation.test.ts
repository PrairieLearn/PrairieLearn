import { describe, expect, it } from 'vitest';

import type { AccessControlFormData, OverrideData } from './types.js';
import { getGlobalDateValidationErrors } from './validation.js';

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
});
