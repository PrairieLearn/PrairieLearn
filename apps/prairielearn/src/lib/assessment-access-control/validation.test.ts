import { assert, describe, it } from 'vitest';

import {
  type AccessControlJsonInput,
  AccessControlJsonSchema,
} from '../../schemas/accessControl.js';

import {
  validateAccessControlRules,
  validateGlobalDateConsistencyIssues,
  validateRule,
  validateRuleCreditMonotonicity,
  validateRuleDateOrdering,
  validateRuleStructuralDependencyIssues,
} from './validation.js';

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
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
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
    const parsedAccessControlExamples = validAccessControlExamples.map((example) =>
      example.map((rule) => AccessControlJsonSchema.parse(rule)),
    );

    parsedAccessControlExamples.forEach((rules, exampleIndex) => {
      const result = validateAccessControlRules({
        rules,
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

    const parsedRules = rulesWithoutMain.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({
      rules: parsedRules,
    });

    assert.isTrue(result.errors.length > 0, 'Expected error when no main rule exists');
    assert.isTrue(
      result.errors.some((err) => err.includes('No defaults found')),
      `Expected "No defaults found" error, but got: ${result.errors.join(', ')}`,
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

    const parsedRules = rulesWithMultipleMain.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({
      rules: parsedRules,
    });

    assert.isTrue(result.errors.length > 0, 'Expected error when multiple main rules exist');
    assert.isTrue(
      result.errors.some((err) => err.includes('Found 2 defaults entries')),
      `Expected "Found 2 defaults entries" error, but got: ${result.errors.join(', ')}`,
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

    const parsedRules = rulesWithOneMain.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({
      rules: parsedRules,
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
    const result = validateAccessControlRules({
      rules: parsedRules,
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

    const result = validateAccessControlRules({
      rules: [parsed],
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

    const result = validateAccessControlRules({
      rules: [parsed],
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
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-25T00:00:00',
        dueDate: '2024-03-20T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('Release date must be before due date')));
  });

  it('should reject early deadline after due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
        earlyDeadlines: [{ date: '2024-03-25T00:00:00', credit: 120 }],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('must be before the due date')));
  });

  it('should reject early deadline before release date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-20T00:00:00',
        earlyDeadlines: [{ date: '2024-03-19T00:00:00', credit: 120 }],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('must be after the release date')));
  });

  it('should reject late deadline before due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
        lateDeadlines: [{ date: '2024-03-18T00:00:00', credit: 80 }],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('must be after the due date')));
  });

  it('should reject late deadline before release date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-20T00:00:00',
        lateDeadlines: [{ date: '2024-03-19T00:00:00', credit: 80 }],
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('must be after the release date')));
  });

  it('should reject out-of-order early deadlines', () => {
    const rule = AccessControlJsonSchema.parse({
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
    const rule = AccessControlJsonSchema.parse({
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
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        showQuestionsAgainDate: '2024-03-30T00:00:00',
        hideQuestionsAgainDate: '2024-03-25T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.some((e) => e.includes('showQuestionsAgainDate must be before')));
  });

  it('should reject showQuestionsAgainDate before last late deadline', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
      },
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2024-03-23T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(
      errors.some((e) => e.includes('Show questions again date must be after the last deadline')),
    );
  });

  it('should reject showQuestionsAgainDate before due date when no late deadlines', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
      },
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2024-03-19T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(
      errors.some((e) => e.includes('Show questions again date must be after the last deadline')),
    );
  });

  it('should reject showScoreAgainDate before last deadline', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
      },
      afterComplete: {
        hideScore: true,
        showScoreAgainDate: '2024-03-22T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(
      errors.some((e) => e.includes('Show score again date must be after the last deadline')),
    );
  });

  it('should accept showQuestionsAgainDate after last deadline', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
      },
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2024-03-26T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.deepEqual(errors, []);
  });

  it('should accept showScoreAgainDate after last deadline', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-20T00:00:00',
      },
      afterComplete: {
        hideScore: true,
        showScoreAgainDate: '2024-03-21T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.deepEqual(errors, []);
  });

  it('should not check show-again dates when release date but no due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-10T00:00:00',
      },
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2024-03-05T00:00:00',
        hideScore: true,
        showScoreAgainDate: '2024-03-05T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.deepEqual(errors, []);
  });

  it('should not check show-again dates when no date control', () => {
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2024-03-23T00:00:00',
        hideScore: true,
        showScoreAgainDate: '2024-03-23T00:00:00',
      },
    });
    const errors = validateRuleDateOrdering(rule);
    assert.deepEqual(errors, []);
  });

  it('should accept valid date ordering', () => {
    const rule = AccessControlJsonSchema.parse({
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
  it('should reject early deadline credit at or below 100%', () => {
    for (const credit of [80, 100]) {
      const rule = AccessControlJsonSchema.parse({
        dateControl: {
          earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit }],
        },
      });
      const errors = validateRuleCreditMonotonicity(rule);
      assert.isTrue(errors.some((e) => e.includes('between 101% and 200%')));
    }
  });

  it('should reject increasing early deadline credits', () => {
    const rule = AccessControlJsonSchema.parse({
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
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 100 }],
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.isTrue(errors.some((e) => e.includes('between 0% and 99%')));
  });

  it('should reject increasing late deadline credits', () => {
    const rule = AccessControlJsonSchema.parse({
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
    const rule = AccessControlJsonSchema.parse({
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

  it('should reject afterLastDeadline credit exceeding last late deadline credit', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-21T00:00:00',
        lateDeadlines: [
          { date: '2024-03-25T00:00:00', credit: 80 },
          { date: '2024-03-28T00:00:00', credit: 50 },
        ],
        afterLastDeadline: { allowSubmissions: true, credit: 60 },
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.isTrue(errors.some((e) => e.includes('must not exceed')));
  });

  it('should reject afterLastDeadline credit exceeding 100 when no late deadlines', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-21T00:00:00',
        afterLastDeadline: { allowSubmissions: true, credit: 110 },
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.isTrue(errors.some((e) => e.includes('must not exceed')));
  });

  it('should accept afterLastDeadline credit equal to last late deadline credit', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-21T00:00:00',
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 50 }],
        afterLastDeadline: { allowSubmissions: true, credit: 50 },
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.deepEqual(errors, []);
  });

  it('should accept afterLastDeadline credit less than last late deadline credit', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-21T00:00:00',
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 50 }],
        afterLastDeadline: { allowSubmissions: true, credit: 30 },
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.deepEqual(errors, []);
  });

  it('should accept afterLastDeadline without credit (practice mode)', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        dueDate: '2024-03-21T00:00:00',
        lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 50 }],
        afterLastDeadline: { allowSubmissions: true },
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.deepEqual(errors, []);
  });

  it('should skip afterLastDeadline check when no due date or late deadlines', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        afterLastDeadline: { allowSubmissions: true, credit: 50 },
      },
    });
    const errors = validateRuleCreditMonotonicity(rule);
    assert.deepEqual(errors, []);
  });
});

describe('Empty accessControl array', () => {
  it('should accept an empty accessControl array without warnings', () => {
    const result = validateAccessControlRules({
      rules: [],
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  it('requires a defaults rule when enrollment-only rules are provided', () => {
    const result = validateAccessControlRules({
      rules: [],
      enrollmentRules: [
        AccessControlJsonSchema.parse({
          dateControl: {
            durationMinutes: 90,
          },
        }),
      ],
    });

    assert.isTrue(result.errors.some((error) => error.includes('No defaults found')));
  });
});

describe('Global temporal validation', () => {
  it('rejects an early deadline before the earliest possible release date', () => {
    const issues = validateGlobalDateConsistencyIssues([
      {
        rule: AccessControlJsonSchema.parse({
          dateControl: {
            releaseDate: '2024-04-07T00:00:00',
          },
        }),
        targetType: 'none',
        ruleIndex: 0,
      },
      {
        rule: AccessControlJsonSchema.parse({
          labels: ['Section A'],
          dateControl: {
            releaseDate: '2024-04-06T00:00:00',
          },
        }),
        targetType: 'student_label',
        ruleIndex: 1,
      },
      {
        rule: AccessControlJsonSchema.parse({
          labels: ['Section B'],
          dateControl: {
            earlyDeadlines: [{ date: '2024-04-05T00:00:00', credit: 120 }],
          },
        }),
        targetType: 'student_label',
        ruleIndex: 2,
      },
    ]);

    assert.isTrue(
      issues.some(
        (issue) =>
          JSON.stringify(issue.path) ===
          JSON.stringify(['dateControl', 'earlyDeadlines', 0, 'date']),
      ),
    );
    assert.isTrue(issues.some((issue) => issue.message.includes('earliest possible release date')));
  });

  it('skips due-based global checks when a due date can be unset', () => {
    const issues = validateGlobalDateConsistencyIssues([
      {
        rule: AccessControlJsonSchema.parse({
          dateControl: {
            releaseDate: '2024-04-07T00:00:00',
            dueDate: '2024-04-08T00:00:00',
          },
        }),
        targetType: 'none',
        ruleIndex: 0,
      },
      {
        rule: AccessControlJsonSchema.parse({
          labels: ['Section A'],
          dateControl: {
            dueDate: null,
          },
        }),
        targetType: 'student_label',
        ruleIndex: 1,
      },
      {
        rule: AccessControlJsonSchema.parse({
          labels: ['Section B'],
          dateControl: {
            lateDeadlines: [{ date: '2024-04-07T12:00:00', credit: 50 }],
          },
        }),
        targetType: 'student_label',
        ruleIndex: 2,
      },
    ]);

    assert.deepEqual(issues, []);
  });

  it('does not skip due-based global checks when an override inherits the due date', () => {
    const issues = validateGlobalDateConsistencyIssues([
      {
        rule: AccessControlJsonSchema.parse({
          dateControl: {
            releaseDate: '2024-04-07T00:00:00',
            dueDate: '2024-04-10T00:00:00',
          },
        }),
        targetType: 'none',
        ruleIndex: 0,
      },
      {
        // Override that only sets an early deadline but does NOT touch dueDate.
        // dueDate is undefined here, meaning "inherit from defaults" (Apr 10),
        // NOT "students have no due date".
        rule: AccessControlJsonSchema.parse({
          labels: ['Section A'],
          dateControl: {
            earlyDeadlines: [{ date: '2024-04-12T00:00:00', credit: 120 }],
          },
        }),
        targetType: 'student_label',
        ruleIndex: 1,
      },
    ]);

    assert.isTrue(
      issues.some((issue) => issue.message.includes('before the latest possible due date')),
    );
  });
});

describe('Duplicate detection', () => {
  it('should reject duplicate PrairieTest exam UUIDs', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
      },
      integrations: {
        prairieTest: {
          exams: [
            { examUuid: '11111111-1111-1111-1111-111111111111' },
            { examUuid: '11111111-1111-1111-1111-111111111111' },
          ],
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.isTrue(errors.some((e) => e.includes('Duplicate PrairieTest exam UUID')));
  });

  it('should accept unique PrairieTest exam UUIDs', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
      },
      integrations: {
        prairieTest: {
          exams: [
            { examUuid: '11111111-1111-1111-1111-111111111111' },
            { examUuid: '22222222-2222-2222-2222-222222222222' },
          ],
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
  });

  it('should reject duplicate early deadline dates', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
        earlyDeadlines: [
          { date: '2024-03-17T23:59:00', credit: 120 },
          { date: '2024-03-17T23:59:00', credit: 110 },
        ],
      },
    });
    const errors = validateRule(rule, 'none');
    assert.isTrue(errors.some((e) => e.includes('Duplicate early deadline date')));
  });

  it('should reject duplicate late deadline dates', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
        lateDeadlines: [
          { date: '2024-03-25T23:59:00', credit: 80 },
          { date: '2024-03-25T23:59:00', credit: 50 },
        ],
      },
    });
    const errors = validateRule(rule, 'none');
    assert.isTrue(errors.some((e) => e.includes('Duplicate late deadline date')));
  });

  it('should accept unique deadline dates', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
        earlyDeadlines: [
          { date: '2024-03-17T23:59:00', credit: 120 },
          { date: '2024-03-19T23:59:00', credit: 110 },
        ],
        lateDeadlines: [
          { date: '2024-03-25T23:59:00', credit: 80 },
          { date: '2024-03-28T23:59:00', credit: 50 },
        ],
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
  });

  it('should surface duplicate errors through validateAccessControlRules', () => {
    const rules = [
      AccessControlJsonSchema.parse({
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
          earlyDeadlines: [
            { date: '2024-03-17T23:59:00', credit: 120 },
            { date: '2024-03-17T23:59:00', credit: 110 },
          ],
        },
      }),
    ];
    const result = validateAccessControlRules({ rules });
    assert.isTrue(result.errors.some((e) => e.includes('Duplicate early deadline date')));
  });
});

describe('Structural field dependency validation', () => {
  it('should accept early deadlines without a due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        earlyDeadlines: [{ date: '2024-03-17T23:59:00', credit: 120 }],
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.deepEqual(issues, []);
  });

  it('should reject late deadlines without a due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.isTrue(issues.some((i) => i.message.includes('Late deadlines require a due date')));
  });

  it('should reject after-complete dates without any deadline', () => {
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2024-03-23T23:59:00',
        hideScore: true,
        showScoreAgainDate: '2024-03-25T23:59:00',
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.isTrue(
      issues.some(
        (i) =>
          i.message.includes('require at least one deadline') &&
          JSON.stringify(i.path) === JSON.stringify(['afterComplete', 'showQuestionsAgainDate']),
      ),
    );
    assert.isTrue(
      issues.some(
        (i) =>
          i.message.includes('require at least one deadline') &&
          JSON.stringify(i.path) === JSON.stringify(['afterComplete', 'showScoreAgainDate']),
      ),
    );
  });

  it('should accept after-complete boolean fields without deadlines', () => {
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        hideQuestions: true,
        hideScore: true,
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.deepEqual(issues, []);
  });

  it('should accept after-complete dates when durationMinutes is set', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        durationMinutes: 60,
      },
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2024-03-23T23:59:00',
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.deepEqual(issues, []);
  });

  it('should accept after-complete dates when PrairieTest is configured', () => {
    const rule = AccessControlJsonSchema.parse({
      integrations: {
        prairieTest: {
          exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
        },
      },
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2024-03-23T23:59:00',
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.deepEqual(issues, []);
  });

  it('should surface structural errors through validateAccessControlRules', () => {
    const rules = [
      AccessControlJsonSchema.parse({
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
        },
      }),
    ];
    const result = validateAccessControlRules({ rules });
    assert.isTrue(result.errors.some((e) => e.includes('Late deadlines require a due date')));
  });

  it('should allow overrides to inherit due date from main rule', () => {
    const rule = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        earlyDeadlines: [{ date: '2024-03-17T23:59:00', credit: 120 }],
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'student_label',
      ruleIndex: 1,
    });
    assert.deepEqual(issues, []);
  });

  it('should reject overrides that explicitly clear due date with late deadlines', () => {
    const rule = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        dueDate: null,
        lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'student_label',
      ruleIndex: 1,
    });
    assert.isTrue(issues.some((i) => i.message.includes('Late deadlines require a due date')));
  });
});
