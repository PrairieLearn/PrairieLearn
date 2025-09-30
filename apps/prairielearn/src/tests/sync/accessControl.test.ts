import { assert, describe, it } from 'vitest';

import type { AccessControlJsonInput } from '../../schemas/accessControl.js';
import { validateAccessControlArray } from '../../sync/course-db.js';

describe('Valid configs', () => {
  const validAccessControlExamples: AccessControlJsonInput[] = [
    // Example 1: Homework with early/late deadlines
    {
      dateControl: {
        enabled: true,
        releaseDateEnabled: true,
        releaseDate: '2024-03-14T00:01:00',
        dueDateEnabled: true,
        dueDate: '2024-03-21T23:59:00',
        earlyDeadlinesEnabled: true,
        earlyDeadlines: [
          { date: '2024-03-17T23:59:00', credit: 120 },
          { date: '2024-03-20T23:59:00', credit: 110 },
        ],
        lateDeadlinesEnabled: true,
        lateDeadlines: [
          { date: '2024-03-23T23:59:00', credit: 80 },
          { date: '2024-03-30T23:59:00', credit: 50 },
        ],
        afterLastDeadline: {
          allowSubmissions: true,
          creditEnabled: true,
          credit: 30,
        },
      },
    },

    // Example 2: Limited Duration Exam
    {
      dateControl: {
        enabled: true,
        releaseDateEnabled: true,
        releaseDate: '2024-03-14T00:01:00',
        dueDateEnabled: true,
        dueDate: '2024-03-21T23:59:00',
        durationMinutesEnabled: true,
        durationMinutes: 60,
      },
      afterComplete: {
        hideQuestions: true,
        hideQuestionsDateControl: {
          showAgainDateEnabled: true,
          showAgainDate: '2024-03-23T23:59:00',
        },
      },
    },

    // Example 3: PrairieTest Exam with afterComplete
    {
      prairieTestControl: {
        enabled: true,
        exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
      },
      afterComplete: {
        hideQuestions: true,
        hideQuestionsDateControl: {
          showAgainDateEnabled: true,
          showAgainDate: '2024-03-23T23:59:00',
        },
        hideScore: true,
        hideScoreDateControl: {
          showAgainDateEnabled: true,
          showAgainDate: '2024-03-23T23:59:00',
        },
      },
    },

    // Example 4: PrairieTest exam with individual override
    {
      targets: ['student1'],
      dateControl: {
        enabled: true,
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
      },
      prairieTestControl: {
        enabled: false,
      },
    },

    // Example 5: In-class with PrairieTest override
    {
      targets: ['student2'],
      prairieTestControl: {
        enabled: true,
        exams: [{ examUuid: '2' }],
      },
    },

    // Example 6: PrairieTest review session
    {
      prairieTestControl: {
        enabled: true,
        exams: [{ examUuid: '1' }, { examUuid: '2', readOnly: true }],
      },
    },

    // Example 7: Extended time override
    {
      targets: ['student3'],
      dateControl: {
        enabled: true,
        durationMinutesEnabled: true,
        durationMinutes: 90,
      },
    },

    // Example 8: Cheat sheet upload + read-only PrairieTest
    {
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
      },
      prairieTestControl: {
        exams: [{ examUuid: '1', readOnly: true }],
      },
    },

    // Example 9: Reveal then hide questions again
    {
      afterComplete: {
        hideQuestions: false,
        hideQuestionsDateControl: {
          showAgainDateEnabled: true,
          showAgainDate: '2024-03-23T23:59:00',
          hideAgainDateEnabled: true,
          hideAgainDate: '2024-03-25T23:59:00',
        },
      },
    },

    // Example 10: Non-real-time grading, hide score
    {
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
      },
      afterComplete: {
        hideScore: true,
      },
    },
  ];

  it('should pass validation for valid access control configs (no warnings or errors)', () => {
    const results = validateAccessControlArray({
      accessControlJsonArray: validAccessControlExamples,
    });

    results.forEach((result, index) => {
      assert.deepEqual(
        result.errors,
        [],
        `Expected no errors for example at index ${index}, but got: ${result.errors.join(', ')}`,
      );
      assert.deepEqual(
        result.warnings,
        [],
        `Expected no warnings for example at index ${index}, but got: ${result.warnings.join(', ')}`,
      );
    });
  });
});

describe('Assignment-Level controls should have no inheritance', () => {
  const assignmentLevelInvalidExamples: AccessControlJsonInput[] = [
    // Null dueDateEnabled at assignment level
    {
      dateControl: {
        dueDateEnabled: null,
        dueDate: '2024-03-21T23:59:00',
      },
    },

    // Null releaseDateEnabled at assignment level
    {
      dateControl: {
        releaseDateEnabled: null,
        releaseDate: '2024-03-14T00:01:00',
      },
    },

    // Null showAgainDateEnabled inside afterComplete
    {
      afterComplete: {
        hideQuestionsDateControl: {
          showAgainDateEnabled: null,
          showAgainDate: '2024-03-23T23:59:00',
        },
      },
    },
  ];

  it('should fail assignment-level validation due to null *Enabled fields', () => {
    const results = validateAccessControlArray({
      accessControlJsonArray: assignmentLevelInvalidExamples,
    });

    results.forEach((result, index) => {
      assert.notDeepEqual(
        result.errors,
        [],
        `Expected assignment-level validation errors at index ${index}, but got none.`,
      );
    });
  });
});

describe('Inherited fields cannot have values', () => {
  const enabledMismatchExamples: AccessControlJsonInput[] = [
    // earlyDeadlinesEnabled is null, but earlyDeadlines is set
    {
      targets: ['target1'],
      dateControl: {
        earlyDeadlinesEnabled: null,
        earlyDeadlines: [{ date: '2024-03-17T23:59:00', credit: 100 }],
      },
    },

    // passwordEnabled is null, but password is set
    {
      targets: ['target1'],
      dateControl: {
        passwordEnabled: null,
        password: 'super-secret',
      },
    },

    // creditEnabled is null inside afterLastDeadline, but credit is set
    {
      targets: ['target1'],
      dateControl: {
        afterLastDeadline: {
          creditEnabled: null,
          credit: 30,
        },
      },
    },

    // showAgainDateEnabled is null, but showAgainDate is set
    {
      targets: ['target1'],
      afterComplete: {
        hideQuestionsDateControl: {
          showAgainDateEnabled: null,
          showAgainDate: '2024-03-23T23:59:00',
        },
      },
    },
  ];

  it('should fail enabled field constraint validation (null enabled but value present)', () => {
    const results = validateAccessControlArray({
      accessControlJsonArray: enabledMismatchExamples,
    });

    results.forEach((result, index) => {
      assert.notDeepEqual(
        result.errors,
        [],
        `Expected enabled-value mismatch errors at index ${index}, but got none.`,
      );
    });
  });
});

describe('Date fields must be dates', () => {
  const dateInvalidExamples: AccessControlJsonInput[] = [
    {
      targets: ['target1'],
      dateControl: {
        releaseDate: 'NOTADATE',
      },
    },
    {
      targets: ['target1'],
      afterComplete: {
        hideQuestionsDateControl: {
          showAgainDateEnabled: null,
          showAgainDate: 'NOTADATE',
        },
      },
    },
    {
      targets: ['target1'],
      dateControl: {
        earlyDeadlinesEnabled: null,
        earlyDeadlines: [{ date: 'NOTADATE', credit: 100 }],
      },
    },
    {
      targets: ['target1'],
      dateControl: {
        earlyDeadlinesEnabled: null,
        earlyDeadlines: [
          { date: '2024-03-17T23:59:00', credit: 120 },
          { date: '2024-03-20T23:59:00', credit: 110 },
        ],
        lateDeadlinesEnabled: true,
        lateDeadlines: [{ date: 'NOTADATE', credit: 80 }],
      },
    },
  ];

  it('should fail date check', () => {
    const results = validateAccessControlArray({
      accessControlJsonArray: dateInvalidExamples,
    });

    results.forEach((result, index) => {
      assert.notDeepEqual(
        result.errors,
        [],
        `Expected date validity errors at index ${index}, but got none.`,
      );
    });
  });
});
