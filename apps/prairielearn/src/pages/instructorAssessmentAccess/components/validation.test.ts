import { describe, expect, it } from 'vitest';

import type { AccessControlFormData } from './types.js';
import { getGlobalDateValidationErrors } from './validation.js';

function makeFormData(overrides: AccessControlFormData['overrides']): AccessControlFormData {
  return {
    mainRule: {
      trackingId: 'main',
      listBeforeRelease: false,
      dateControlEnabled: true,
      releaseDate: '2024-04-07T00:00:00',
      dueDate: '2024-04-10T00:00:00',
      earlyDeadlines: [],
      lateDeadlines: [],
      afterLastDeadline: null,
      durationMinutes: null,
      password: null,
      prairieTestExams: [],
      questionVisibility: { hideQuestions: true },
      scoreVisibility: { hideScore: false },
    },
    overrides,
  };
}

describe('getGlobalDateValidationErrors', () => {
  it('maps an impossible early deadline to the matching override field path', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([
        {
          trackingId: 'override-1',
          appliesTo: {
            targetType: 'student_label',
            enrollments: [],
            studentLabels: [{ studentLabelId: '1', name: 'Section A' }],
          },
          overriddenFields: ['releaseDate'],
          releaseDate: '2024-04-06T00:00:00',
          dueDate: null,
          earlyDeadlines: [],
          lateDeadlines: [],
          afterLastDeadline: null,
          durationMinutes: null,
          password: null,
          questionVisibility: { hideQuestions: true },
          scoreVisibility: { hideScore: false },
        },
        {
          trackingId: 'override-2',
          appliesTo: {
            targetType: 'enrollment',
            enrollments: [{ enrollmentId: 'e1', uid: 'student1', name: 'Student 1' }],
            studentLabels: [],
          },
          overriddenFields: ['earlyDeadlines'],
          releaseDate: null,
          dueDate: null,
          earlyDeadlines: [{ date: '2024-04-05T00:00:00', credit: 120 }],
          lateDeadlines: [],
          afterLastDeadline: null,
          durationMinutes: null,
          password: null,
          questionVisibility: { hideQuestions: true },
          scoreVisibility: { hideScore: false },
        },
      ]),
    );

    expect(errors).toContainEqual({
      path: 'overrides.1.earlyDeadlines.0.date',
      message: 'Early deadline must be after the earliest possible release date.',
    });
  });

  it('reports credit monotonicity errors for the main rule', () => {
    const data = makeFormData([]);
    data.mainRule.lateDeadlines = [
      { date: '2024-04-11T00:00:00', credit: 50 },
      { date: '2024-04-12T00:00:00', credit: 80 },
    ];

    const errors = getGlobalDateValidationErrors(data);

    expect(errors).toContainEqual({
      path: 'mainRule.lateDeadlines.1.credit',
      message: 'Late deadline credits must be monotonically decreasing.',
    });
  });

  it('reports credit range errors for early deadlines', () => {
    const data = makeFormData([]);
    data.mainRule.earlyDeadlines = [{ date: '2024-04-08T00:00:00', credit: 50 }];

    const errors = getGlobalDateValidationErrors(data);

    expect(errors).toContainEqual({
      path: 'mainRule.earlyDeadlines.0.credit',
      message: 'Early deadline credit must be between 101% and 200%, got 50%.',
    });
  });

  it('reports duplicate date errors', () => {
    const data = makeFormData([]);
    data.mainRule.lateDeadlines = [
      { date: '2024-04-11T00:00:00', credit: 80 },
      { date: '2024-04-11T00:00:00', credit: 50 },
    ];

    const errors = getGlobalDateValidationErrors(data);

    expect(errors).toContainEqual({
      path: 'mainRule.lateDeadlines.1.date',
      message: 'Duplicate late deadline date: 2024-04-11T00:00:00.',
    });
  });

  it('skips credit monotonicity when dates are out of order', () => {
    const data = makeFormData([]);
    data.mainRule.lateDeadlines = [
      { date: '2024-04-12T00:00:00', credit: 50 },
      { date: '2024-04-11T00:00:00', credit: 80 },
    ];

    const errors = getGlobalDateValidationErrors(data);

    // Should have a date ordering error but NOT a credit monotonicity error
    expect(errors).toContainEqual(
      expect.objectContaining({ message: 'Late deadlines must be in chronological order.' }),
    );
    expect(errors).not.toContainEqual(
      expect.objectContaining({
        message: 'Late deadline credits must be monotonically decreasing.',
      }),
    );
  });

  it('reports after-last-deadline credit exceeding preceding credit', () => {
    const data = makeFormData([]);
    data.mainRule.lateDeadlines = [{ date: '2024-04-11T00:00:00', credit: 50 }];
    data.mainRule.afterLastDeadline = { credit: 80 };

    const errors = getGlobalDateValidationErrors(data);

    expect(errors).toContainEqual({
      path: 'mainRule.afterLastDeadline.credit',
      message:
        "After-last-deadline credit (80%) must not exceed the preceding deadline's credit (50%).",
    });
  });

  it('skips due-based global errors when any rule can unset the due date', () => {
    const errors = getGlobalDateValidationErrors(
      makeFormData([
        {
          trackingId: 'override-1',
          appliesTo: {
            targetType: 'student_label',
            enrollments: [],
            studentLabels: [{ studentLabelId: '1', name: 'Section A' }],
          },
          overriddenFields: ['dueDate'],
          releaseDate: null,
          dueDate: null,
          earlyDeadlines: [],
          lateDeadlines: [],
          afterLastDeadline: null,
          durationMinutes: null,
          password: null,
          questionVisibility: { hideQuestions: true },
          scoreVisibility: { hideScore: false },
        },
        {
          trackingId: 'override-2',
          appliesTo: {
            targetType: 'student_label',
            enrollments: [],
            studentLabels: [{ studentLabelId: '2', name: 'Section B' }],
          },
          overriddenFields: ['lateDeadlines'],
          releaseDate: null,
          dueDate: null,
          earlyDeadlines: [],
          lateDeadlines: [{ date: '2024-04-07T12:00:00', credit: 50 }],
          afterLastDeadline: null,
          durationMinutes: null,
          password: null,
          questionVisibility: { hideQuestions: true },
          scoreVisibility: { hideScore: false },
        },
      ]),
    );

    expect(errors).toEqual([]);
  });
});
