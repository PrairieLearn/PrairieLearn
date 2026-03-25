import { assert, describe, it } from 'vitest';

import {
  type AccessControlJson,
  type AccessControlJsonInput,
  AccessControlJsonSchema,
  validateRuleCreditMonotonicity,
  validateRuleDateOrdering,
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
          showQuestionsAgainDate: '2024-03-23T23:59:00',
        },
      },
    ],

    // Example 3: PrairieTest Exam with afterComplete
    [
      {
        integrations: {
          prairieTest: {
            exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
          },
        },
        afterComplete: {
          hideQuestions: true,
          showQuestionsAgainDate: '2024-03-23T23:59:00',
          hideScore: true,
          showScoreAgainDate: '2024-03-23T23:59:00',
        },
      },
    ],

    // Example 6: PrairieTest review session
    [
      {
        integrations: {
          prairieTest: {
            exams: [
              { examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' },
              { examUuid: '22f99903-4a00-5e80-a1b3-332483025d6d', readOnly: true },
            ],
          },
        },
      },
    ],

    // Example 7: Extended time override
    [
      {
        // Main rule (no targets)
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
          durationMinutes: 60,
        },
      },
      {
        // Individual override
        labels: ['student3'],
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
        integrations: {
          prairieTest: {
            exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c', readOnly: true }],
          },
        },
      },
    ],

    // Example 9: Reveal then hide questions again
    [
      {
        afterComplete: {
          hideQuestions: false,
          showQuestionsAgainDate: '2024-03-23T23:59:00',
          hideQuestionsAgainDate: '2024-03-25T23:59:00',
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
      const result = validateAccessControlArray({
        accessControlJsonArray: rules,
      });

      assert.deepEqual(
        result.errors,
        [],
        `Expected no errors for example ${exampleIndex}, but got: ${result.errors.join(', ')}`,
      );
      assert.deepEqual(
        result.warnings,
        [],
        `Expected no warnings for example ${exampleIndex}, but got: ${result.warnings.join(', ')}`,
      );
    });
  });
});

describe('Main rule requirement', () => {
  it('should fail validation when no main rule exists', () => {
    const rulesWithoutMain: AccessControlJsonInput[] = [
      {
        labels: ['student1'],
        dateControl: {
          durationMinutes: 90,
        },
      },
      {
        labels: ['student2'],
        dateControl: {
          durationMinutes: 120,
        },
      },
    ];

    const parsedRules: AccessControlJson[] = rulesWithoutMain.map((rule) =>
      AccessControlJsonSchema.parse(rule),
    );
    const result = validateAccessControlArray({
      accessControlJsonArray: parsedRules,
    });

    assert.isTrue(result.errors.length > 0, 'Expected error when no main rule exists');
    assert.isTrue(
      result.errors.some((err) => err.includes('No main rule found')),
      `Expected "No main rule found" error, but got: ${result.errors.join(', ')}`,
    );
  });

  it('should fail validation when multiple main rules exist', () => {
    const rulesWithMultipleMain: AccessControlJsonInput[] = [
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

    const parsedRules: AccessControlJson[] = rulesWithMultipleMain.map((rule) =>
      AccessControlJsonSchema.parse(rule),
    );
    const result = validateAccessControlArray({
      accessControlJsonArray: parsedRules,
    });

    assert.isTrue(result.errors.length > 0, 'Expected error when multiple main rules exist');
    assert.isTrue(
      result.errors.some((err) => err.includes('Found 2 main rules')),
      `Expected "Found 2 main rules" error, but got: ${result.errors.join(', ')}`,
    );
  });

  it('should pass validation with exactly one main rule', () => {
    const rulesWithOneMain: AccessControlJsonInput[] = [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
      },
    ];

    const parsedRules: AccessControlJson[] = rulesWithOneMain.map((rule) =>
      AccessControlJsonSchema.parse(rule),
    );
    const result = validateAccessControlArray({
      accessControlJsonArray: parsedRules,
    });

    assert.equal(result.errors.length, 0, 'Should have no errors with one main rule');
  });

  it('should fail validation when an override specifies listBeforeRelease', () => {
    const rules: AccessControlJsonInput[] = [
      {
        listBeforeRelease: false,
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
      },
      {
        labels: ['student1'],
        listBeforeRelease: true,
        dateControl: {
          dueDate: '2024-03-22T23:59:00',
        },
      },
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlArray({
      accessControlJsonArray: parsedRules,
    });

    assert.isTrue(
      result.errors.some((err) => err.includes('listBeforeRelease can only be specified')),
      `Expected listBeforeRelease validation error, but got: ${result.errors.join(', ')}`,
    );
  });
});

describe('Date fields without seconds', () => {
  it('should accept and transform dates without seconds', () => {
    const ruleWithDateWithoutSeconds: AccessControlJsonInput = {
      dateControl: {
        releaseDate: '2024-03-14T00:01', // No seconds
        dueDate: '2024-03-21T23:59', // No seconds
        earlyDeadlines: [{ date: '2024-03-17T23:59', credit: 120 }],
        lateDeadlines: [{ date: '2024-03-23T23:59', credit: 80 }],
      },
      afterComplete: {
        showQuestionsAgainDate: '2024-03-25T12:00', // No seconds
      },
    };

    const parsed = AccessControlJsonSchema.parse(ruleWithDateWithoutSeconds);

    assert.equal(parsed.dateControl?.releaseDate, '2024-03-14T00:01:00');
    assert.equal(parsed.dateControl?.dueDate, '2024-03-21T23:59:00');
    assert.equal(parsed.dateControl?.earlyDeadlines?.[0].date, '2024-03-17T23:59:00');
    assert.equal(parsed.dateControl?.lateDeadlines?.[0].date, '2024-03-23T23:59:00');
    assert.equal(parsed.afterComplete?.showQuestionsAgainDate, '2024-03-25T12:00:00');

    const result = validateAccessControlArray({
      accessControlJsonArray: [parsed],
    });
    assert.deepEqual(result.errors, [], `Expected no errors, but got: ${result.errors.join(', ')}`);
  });

  it('should still accept dates with seconds', () => {
    const ruleWithDateWithSeconds: AccessControlJsonInput = {
      dateControl: {
        releaseDate: '2024-03-14T00:01:00', // With seconds
        dueDate: '2024-03-21T23:59:00', // With seconds
      },
    };

    const parsed = AccessControlJsonSchema.parse(ruleWithDateWithSeconds);

    assert.equal(parsed.dateControl?.releaseDate, '2024-03-14T00:01:00');
    assert.equal(parsed.dateControl?.dueDate, '2024-03-21T23:59:00');

    const result = validateAccessControlArray({
      accessControlJsonArray: [parsed],
    });
    assert.deepEqual(result.errors, [], `Expected no errors, but got: ${result.errors.join(', ')}`);
  });
});

describe('Date fields must be dates', () => {
  const dateInvalidExamples: {
    config: AccessControlJsonInput;
    expectedPath: (string | number)[];
  }[] = [
    {
      config: {
        dateControl: {
          releaseDate: 'NOTADATE',
        },
      },
      expectedPath: ['dateControl', 'releaseDate'],
    },
    {
      config: {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
        },
        afterComplete: {
          showQuestionsAgainDate: 'NOTADATE',
        },
      },
      expectedPath: ['afterComplete', 'showQuestionsAgainDate'],
    },
    {
      config: {
        dateControl: {
          earlyDeadlines: [{ date: 'NOTADATE', credit: 100 }],
        },
      },
      expectedPath: ['dateControl', 'earlyDeadlines', 0, 'date'],
    },
    {
      config: {
        dateControl: {
          earlyDeadlines: [
            { date: '2024-03-17T23:59:00', credit: 120 },
            { date: '2024-03-20T23:59:00', credit: 110 },
          ],
          lateDeadlines: [{ date: 'NOTADATE', credit: 80 }],
        },
      },
      expectedPath: ['dateControl', 'lateDeadlines', 0, 'date'],
    },
  ];

  it('should fail Zod parsing with correct error paths for invalid dates', () => {
    dateInvalidExamples.forEach((example, exampleIndex) => {
      const result = AccessControlJsonSchema.safeParse(example.config);

      assert.isFalse(result.success, `Expected parsing to fail at example ${exampleIndex}`);
      const hasExpectedPath = result.error.issues.some(
        (issue) => JSON.stringify(issue.path) === JSON.stringify(example.expectedPath),
      );
      assert.isTrue(
        hasExpectedPath,
        `Expected error at path ${JSON.stringify(example.expectedPath)} at example ${exampleIndex}, but got: ${JSON.stringify(result.error.issues.map((i) => i.path))}`,
      );
    });
  });
});

describe('Exam UUID validation', () => {
  it('should reject invalid exam UUIDs', () => {
    const result = AccessControlJsonSchema.safeParse({
      integrations: {
        prairieTest: {
          exams: [{ examUuid: 'not-a-uuid' }],
        },
      },
    });

    assert.isFalse(result.success);
    assert.isTrue(
      result.error.issues.some(
        (issue) =>
          JSON.stringify(issue.path) ===
          JSON.stringify(['integrations', 'prairieTest', 'exams', 0, 'examUuid']),
      ),
    );
  });

  it('should accept valid exam UUIDs', () => {
    const result = AccessControlJsonSchema.safeParse({
      integrations: {
        prairieTest: {
          exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
        },
      },
    });

    assert.isTrue(result.success);
  });
});

describe('Date ordering validation', () => {
  it('should reject release date after due date', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-25T00:00:00',
        dueDate: '2024-03-20T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('Release date must be before due date')));
  });

  it('should reject early deadline after due date', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
        earlyDeadlines: [{ date: '2024-03-25T00:00:00', credit: 120 }],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('must be before the due date')));
  });

  it('should reject late deadline before due date', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
        lateDeadlines: [{ date: '2024-03-18T00:00:00', credit: 80 }],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('must be after the due date')));
  });

  it('should reject out-of-order early deadlines', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        earlyDeadlines: [
          { date: '2024-03-18T00:00:00', credit: 130 },
          { date: '2024-03-15T00:00:00', credit: 120 },
        ],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('chronological order')));
  });

  it('should reject out-of-order late deadlines', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        lateDeadlines: [
          { date: '2024-03-28T00:00:00', credit: 80 },
          { date: '2024-03-25T00:00:00', credit: 50 },
        ],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('chronological order')));
  });

  it('should reject showQuestionsAgainDate after hideQuestionsAgainDate', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      afterComplete: {
        showQuestionsAgainDate: '2024-03-30T00:00:00',
        hideQuestionsAgainDate: '2024-03-25T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('showQuestionsAgainDate must be before')));
  });

  it('should accept valid date ordering', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-10T00:00:00',
        dueDate: '2024-03-20T00:00:00',
        earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit: 120 }],
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.deepEqual(errors, []);
  });
});

describe('Credit monotonicity validation', () => {
  it('should reject early deadline credit below 100%', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit: 80 }],
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.isTrue(errors.some((e) => e.includes('at least 100%')));
  });

  it('should reject increasing early deadline credits', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        earlyDeadlines: [
          { date: '2024-03-12T00:00:00', credit: 110 },
          { date: '2024-03-15T00:00:00', credit: 130 },
        ],
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.isTrue(errors.some((e) => e.includes('monotonically decreasing')));
  });

  it('should reject late deadline credit at or above 100%', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 100 }],
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.isTrue(errors.some((e) => e.includes('less than 100%')));
  });

  it('should reject increasing late deadline credits', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        lateDeadlines: [
          { date: '2024-03-25T00:00:00', credit: 50 },
          { date: '2024-03-28T00:00:00', credit: 80 },
        ],
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.isTrue(errors.some((e) => e.includes('monotonically decreasing')));
  });

  it('should accept valid credit values', () => {
    const rule: AccessControlJson = AccessControlJsonSchema.parse({
      dateControl: {
        earlyDeadlines: [
          { date: '2024-03-12T00:00:00', credit: 130 },
          { date: '2024-03-15T00:00:00', credit: 110 },
        ],
        lateDeadlines: [
          { date: '2024-03-25T00:00:00', credit: 80 },
          { date: '2024-03-28T00:00:00', credit: 50 },
        ],
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.deepEqual(errors, []);
  });
});

describe('Empty accessControl array', () => {
  it('should warn when accessControl array is empty', () => {
    const result = validateAccessControlArray({
      accessControlJsonArray: [],
    });
    assert.deepEqual(result.errors, []);
    assert.isTrue(result.warnings.some((w) => w.includes('accessControl array is empty')));
  });
});
