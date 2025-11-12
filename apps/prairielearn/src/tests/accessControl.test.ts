import { assert, describe, it } from 'vitest';

import {
  type AccessControlJson,
  type AccessControlJsonInput,
  AccessControlJsonSchema,
} from '../schemas/accessControl.js';
import { validateAccessControlArray } from '../sync/course-db.js';

describe('Valid configs', () => {
  const validAccessControlExamples: AccessControlJsonInput[][] = [
    // Example 1: Homework with early/late deadlines
    [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
          earlyDeadlines: [
            { date: '2024-03-17T23:59:00', credit: 120 },
            { date: '2024-03-20T23:59:00', credit: 110 },
          ],
          lateDeadlines: [
            { date: '2024-03-23T23:59:00', credit: 80 },
            { date: '2024-03-30T23:59:00', credit: 50 },
          ],
          afterLastDeadline: {
            allowSubmissions: true,
            credit: 30,
          },
        },
      },
    ],

    // Example 2: Limited Duration Exam
    [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
          durationMinutes: 60,
        },
        afterComplete: {
          hideQuestions: true,
          hideQuestionsDateControl: {
            showAgainDate: '2024-03-23T23:59:00',
          },
        },
      },
    ],

    // Example 3: PrairieTest Exam with afterComplete
    [
      {
        prairieTestControl: {
          exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
        },
        afterComplete: {
          hideQuestions: true,
          hideQuestionsDateControl: {
            showAgainDate: '2024-03-23T23:59:00',
          },
          hideScore: true,
          hideScoreDateControl: {
            showAgainDate: '2024-03-23T23:59:00',
          },
        },
      },
    ],

    // TODO: remove because we aren't allowing PT overrides?
    // // Example 4: PrairieTest exam with individual override
    // [
    //   {
    //     // Assignment-level (no targets)
    //     dateControl: {
    //       releaseDate: '2024-03-14T00:01:00',
    //       dueDate: '2024-03-21T23:59:00',
    //     },
    //   },
    //   {
    //     // Individual override
    //     targets: ['student1'],
    //     prairieTestControl: {},
    //   },
    // ],

    // // Example 5: In-class with PrairieTest override
    // [
    //   {
    //     // Assignment-level (no targets)
    //     dateControl: {
    //       releaseDate: '2024-03-14T00:01:00',
    //       dueDate: '2024-03-21T23:59:00',
    //     },
    //   },
    //   {
    //     // Individual override
    //     targets: ['student2'],
    //     prairieTestControl: {
    //       exams: [{ examUuid: '2' }],
    //     },
    //   },
    // ],

    // Example 6: PrairieTest review session
    [
      {
        prairieTestControl: {
          exams: [{ examUuid: '1' }, { examUuid: '2', readOnly: true }],
        },
      },
    ],

    // Example 7: Extended time override
    [
      {
        // Assignment-level (no targets)
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
          durationMinutes: 60,
        },
      },
      {
        // Individual override
        targets: ['student3'],
        dateControl: {
          durationMinutes: 90,
        },
      },
    ],

    // Example 8: Cheat sheet upload + read-only PrairieTest
    [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
        prairieTestControl: {
          exams: [{ examUuid: '1', readOnly: true }],
        },
      },
    ],

    // Example 9: Reveal then hide questions again
    [
      {
        afterComplete: {
          hideQuestions: false,
          hideQuestionsDateControl: {
            showAgainDate: '2024-03-23T23:59:00',
            hideAgainDate: '2024-03-25T23:59:00',
          },
        },
      },
    ],

    // Example 10: Non-real-time grading, hide score
    [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
        afterComplete: {
          hideScore: true,
        },
      },
    ],
  ];

  it('should pass validation for valid access control configs (no warnings or errors)', () => {
    const parsedAccessControlExamples: AccessControlJson[][] = validAccessControlExamples.map(
      (example) => example.map((rule) => AccessControlJsonSchema.parse(rule)),
    );

    parsedAccessControlExamples.forEach((rules, exampleIndex) => {
      const results = validateAccessControlArray({
        accessControlJsonArray: rules,
      });

      results.forEach((result, ruleIndex) => {
        assert.deepEqual(
          result.errors,
          [],
          `Expected no errors for example ${exampleIndex}, rule ${ruleIndex}, but got: ${result.errors.join(', ')}`,
        );
        assert.deepEqual(
          result.warnings,
          [],
          `Expected no warnings for example ${exampleIndex}, rule ${ruleIndex}, but got: ${result.warnings.join(', ')}`,
        );
      });
    });
  });
});

describe('Assignment-level rule requirement', () => {
  it('should fail validation when no assignment-level rule exists', () => {
    const rulesWithoutAssignmentLevel: AccessControlJsonInput[] = [
      {
        targets: ['student1'],
        dateControl: {
          durationMinutes: 90,
        },
      },
      {
        targets: ['student2'],
        dateControl: {
          durationMinutes: 120,
        },
      },
    ];

    const parsedRules: AccessControlJson[] = rulesWithoutAssignmentLevel.map((rule) =>
      AccessControlJsonSchema.parse(rule),
    );
    const results = validateAccessControlArray({
      accessControlJsonArray: parsedRules,
    });

    // should have an error on the first rule
    assert.isTrue(
      results[0].errors.length > 0,
      'Expected error when no assignment-level rule exists',
    );
    assert.isTrue(
      results[0].errors.some((err) => err.includes('No assignment-level rule found')),
      `Expected "No assignment-level rule found" error, but got: ${results[0].errors.join(', ')}`,
    );
  });

  it('should fail validation when multiple assignment-level rules exist', () => {
    const rulesWithMultipleAssignmentLevel: AccessControlJsonInput[] = [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
      },
      {
        dateControl: {
          releaseDate: '2024-03-15T00:01:00',
          dueDate: '2024-03-22T23:59:00',
        },
      },
    ];

    const parsedRules: AccessControlJson[] = rulesWithMultipleAssignmentLevel.map((rule) =>
      AccessControlJsonSchema.parse(rule),
    );
    const results = validateAccessControlArray({
      accessControlJsonArray: parsedRules,
    });

    // Should have an error on the first rule
    assert.isTrue(
      results[0].errors.length > 0,
      'Expected error when multiple assignment-level rules exist',
    );
    assert.isTrue(
      results[0].errors.some((err) => err.includes('Found 2 assignment-level rules')),
      `Expected "Found 2 assignment-level rules" error, but got: ${results[0].errors.join(', ')}`,
    );
  });

  it('should pass validation with exactly one assignment-level rule', () => {
    const rulesWithOneAssignmentLevel: AccessControlJsonInput[] = [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
      },
    ];

    const parsedRules: AccessControlJson[] = rulesWithOneAssignmentLevel.map((rule) =>
      AccessControlJsonSchema.parse(rule),
    );
    const results = validateAccessControlArray({
      accessControlJsonArray: parsedRules,
    });

    assert.equal(
      results[0].errors.length,
      0,
      'Should have no errors with one assignment-level rule',
    );
  });
});

describe('Date fields must be dates', () => {
  const dateInvalidExamples: {
    config: AccessControlJsonInput[];
    expectedError: string;
  }[] = [
    {
      config: [
        {
          dateControl: {
            releaseDate: 'NOTADATE',
          },
        },
      ],
      expectedError: 'Invalid date format for dateControl.releaseDate: "NOTADATE"',
    },
    {
      config: [
        {
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
          },
          afterComplete: {
            hideQuestionsDateControl: {
              showAgainDate: 'NOTADATE',
            },
          },
        },
      ],
      expectedError:
        'Invalid date format for afterComplete.hideQuestionsDateControl.showAgainDate: "NOTADATE"',
    },
    {
      config: [
        {
          dateControl: {
            earlyDeadlines: [{ date: 'NOTADATE', credit: 100 }],
          },
        },
      ],
      expectedError: 'Invalid date format for dateControl.earlyDeadlines[0].date: "NOTADATE"',
    },
    {
      config: [
        {
          dateControl: {
            earlyDeadlines: [
              { date: '2024-03-17T23:59:00', credit: 120 },
              { date: '2024-03-20T23:59:00', credit: 110 },
            ],
            lateDeadlines: [{ date: 'NOTADATE', credit: 80 }],
          },
        },
      ],
      expectedError: 'Invalid date format for dateControl.lateDeadlines[0].date: "NOTADATE"',
    },
  ];

  it('should fail date check with correct error messages', () => {
    dateInvalidExamples.forEach((example, exampleIndex) => {
      const parsedRules: AccessControlJson[] = example.config.map((rule) =>
        AccessControlJsonSchema.parse(rule),
      );
      const results = validateAccessControlArray({
        accessControlJsonArray: parsedRules,
      });

      const expectedError = example.expectedError;
      assert.isTrue(
        results[0].errors.length > 0,
        `Expected date validity errors at example ${exampleIndex}, but got none.`,
      );
      assert.isTrue(
        results[0].errors.some((err) => err.includes(expectedError)),
        `Expected error containing "${expectedError}" at example ${exampleIndex}, but got: ${results[0].errors.join(', ')}`,
      );
    });
  });
});
