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
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-23T23:59:00',
          },
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
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-23T23:59:00',
          },
          score: {
            hidden: true,
            visibleFromDate: '2024-03-23T23:59:00',
          },
        },
      },
    ],

    // Example 4: PrairieTest review session
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

    // Example 5: Extended time override
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

    // Example 6: Cheat sheet upload + read-only PrairieTest
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

    // Example 7: Show questions between dates then re-hide
    [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-23T23:59:00',
            visibleUntilDate: '2024-03-25T23:59:00',
          },
        },
      },
    ],

    // Example 8: Non-real-time grading, hide score
    [
      {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
        },
        afterComplete: {
          score: {
            hidden: true,
          },
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
      result.errors.includes(
        'No defaults found. The first element of accessControl must apply to everyone.',
      ),
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
      result.errors.includes(
        'Found 2 defaults entries. Only one element of accessControl should apply to everyone.',
      ),
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
      result.errors.includes('listBeforeRelease can only be specified on the defaults.'),
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
        questions: {
          hidden: true,
          visibleFromDate: '2024-03-25T12:00', // No seconds
        },
      },
    };

    const parsed = AccessControlJsonSchema.parse(ruleWithDateWithoutSeconds);

    assert.equal(parsed.dateControl?.releaseDate, '2024-03-14T00:01:00');
    assert.equal(parsed.dateControl?.dueDate, '2024-03-21T23:59:00');
    assert.equal(parsed.dateControl?.earlyDeadlines?.[0].date, '2024-03-17T23:59:00');
    assert.equal(parsed.dateControl?.lateDeadlines?.[0].date, '2024-03-23T23:59:00');
    assert.equal(parsed.afterComplete?.questions?.visibleFromDate, '2024-03-25T12:00:00');

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
  it.each([
    {
      label: 'releaseDate',
      config: { dateControl: { releaseDate: 'NOTADATE' } },
      expectedPath: ['dateControl', 'releaseDate'],
    },
    {
      label: 'showQuestionsAgainDate',
      config: {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
        },
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: 'NOTADATE',
          },
        },
      },
      expectedPath: ['afterComplete', 'questions', 'visibleFromDate'],
    },
    {
      label: 'early deadline date',
      config: { dateControl: { earlyDeadlines: [{ date: 'NOTADATE', credit: 100 }] } },
      expectedPath: ['dateControl', 'earlyDeadlines', 0, 'date'],
    },
    {
      label: 'late deadline date',
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
  ])('rejects invalid $label', ({ config, expectedPath }) => {
    const result = AccessControlJsonSchema.safeParse(config);
    assert.isFalse(result.success);
    assert.isTrue(
      result.error.issues.some(
        (issue) => JSON.stringify(issue.path) === JSON.stringify(expectedPath),
      ),
    );
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
  it.each([
    {
      label: 'release date after due date',
      config: {
        dateControl: { releaseDate: '2024-03-25T00:00:00', dueDate: '2024-03-20T00:00:00' },
      },
      errorMatch: 'Release date must be before due date.',
    },
    {
      label: 'early deadline after due date',
      config: {
        dateControl: {
          dueDate: '2024-03-20T00:00:00',
          earlyDeadlines: [{ date: '2024-03-25T00:00:00', credit: 120 }],
        },
      },
      errorMatch: 'Early deadline date 2024-03-25T00:00:00 must be on or before the due date.',
    },
    {
      label: 'early deadline before release date',
      config: {
        dateControl: {
          releaseDate: '2024-03-20T00:00:00',
          earlyDeadlines: [{ date: '2024-03-19T00:00:00', credit: 120 }],
        },
      },
      errorMatch: 'Early deadline date 2024-03-19T00:00:00 must be after the release date.',
    },
    {
      label: 'late deadline before due date',
      config: {
        dateControl: {
          dueDate: '2024-03-20T00:00:00',
          lateDeadlines: [{ date: '2024-03-18T00:00:00', credit: 80 }],
        },
      },
      errorMatch: 'Late deadline date 2024-03-18T00:00:00 must be on or after the due date.',
    },
    {
      label: 'late deadline before release date',
      config: {
        dateControl: {
          releaseDate: '2024-03-20T00:00:00',
          lateDeadlines: [{ date: '2024-03-19T00:00:00', credit: 80 }],
        },
      },
      errorMatch: 'Late deadline date 2024-03-19T00:00:00 must be after the release date.',
    },
    {
      label: 'out-of-order early deadlines',
      config: {
        dateControl: {
          earlyDeadlines: [
            { date: '2024-03-18T00:00:00', credit: 130 },
            { date: '2024-03-15T00:00:00', credit: 120 },
          ],
        },
      },
      errorMatch: 'Early deadlines must be in chronological order.',
    },
    {
      label: 'out-of-order late deadlines',
      config: {
        dateControl: {
          lateDeadlines: [
            { date: '2024-03-28T00:00:00', credit: 80 },
            { date: '2024-03-25T00:00:00', credit: 50 },
          ],
        },
      },
      errorMatch: 'Late deadlines must be in chronological order.',
    },
    {
      label: 'visibleFromDate after visibleUntilDate for questions',
      config: {
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-30T00:00:00',
            visibleUntilDate: '2024-03-25T00:00:00',
          },
        },
      },
      errorMatch: 'visibleFromDate must be before visibleUntilDate.',
    },
    {
      label: 'visibleFromDate before last late deadline for questions',
      config: {
        dateControl: {
          dueDate: '2024-03-20T00:00:00',
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
        },
        afterComplete: { questions: { hidden: true, visibleFromDate: '2024-03-23T00:00:00' } },
      },
      errorMatch: 'Show questions again date must be after the last deadline.',
    },
    {
      label: 'visibleFromDate before due date (no late deadlines) for questions',
      config: {
        dateControl: { dueDate: '2024-03-20T00:00:00' },
        afterComplete: { questions: { hidden: true, visibleFromDate: '2024-03-19T00:00:00' } },
      },
      errorMatch: 'Show questions again date must be after the last deadline.',
    },
    {
      label: 'visibleFromDate before last deadline for score',
      config: {
        dateControl: {
          dueDate: '2024-03-20T00:00:00',
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
        },
        afterComplete: { score: { hidden: true, visibleFromDate: '2024-03-22T00:00:00' } },
      },
      errorMatch: 'Show score again date must be after the last deadline.',
    },
  ])('rejects $label', ({ config, errorMatch }) => {
    const rule = AccessControlJsonSchema.parse(config);
    const errors = validateRuleDateOrdering(rule);
    assert.isTrue(errors.includes(errorMatch));
  });

  it.each([
    {
      label: 'early deadline equal to due date',
      config: {
        dateControl: {
          dueDate: '2024-03-20T00:00:00',
          earlyDeadlines: [{ date: '2024-03-20T00:00:00', credit: 120 }],
        },
      },
    },
    {
      label: 'late deadline equal to due date',
      config: {
        dateControl: {
          dueDate: '2024-03-20T00:00:00',
          lateDeadlines: [{ date: '2024-03-20T00:00:00', credit: 80 }],
        },
      },
    },
    {
      label: 'visibleFromDate after last deadline for questions',
      config: {
        dateControl: {
          dueDate: '2024-03-20T00:00:00',
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
        },
        afterComplete: { questions: { hidden: true, visibleFromDate: '2024-03-26T00:00:00' } },
      },
    },
    {
      label: 'visibleFromDate after last deadline for score',
      config: {
        dateControl: { dueDate: '2024-03-20T00:00:00' },
        afterComplete: { score: { hidden: true, visibleFromDate: '2024-03-21T00:00:00' } },
      },
    },
    {
      label: 'show-again dates skipped when no due date',
      config: {
        dateControl: { releaseDate: '2024-03-10T00:00:00' },
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-05T00:00:00',
          },
          score: {
            hidden: true,
            visibleFromDate: '2024-03-05T00:00:00',
          },
        },
      },
    },
    {
      label: 'valid date ordering',
      config: {
        dateControl: {
          releaseDate: '2024-03-10T00:00:00',
          dueDate: '2024-03-20T00:00:00',
          earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit: 120 }],
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
        },
      },
    },
  ])('accepts $label', ({ config }) => {
    const rule = AccessControlJsonSchema.parse(config);
    assert.deepEqual(validateRuleDateOrdering(rule), []);
  });
});

describe('Credit monotonicity validation', () => {
  it.each([
    {
      label: 'early deadline credit at 80% (below 101%)',
      config: { dateControl: { earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit: 80 }] } },
      errorMatch: 'Early deadline credit must be between 101% and 200%, got 80%.',
    },
    {
      label: 'early deadline credit at 100% (below 101%)',
      config: { dateControl: { earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit: 100 }] } },
      errorMatch: 'Early deadline credit must be between 101% and 200%, got 100%.',
    },
    {
      label: 'increasing early deadline credits',
      config: {
        dateControl: {
          earlyDeadlines: [
            { date: '2024-03-12T00:00:00', credit: 110 },
            { date: '2024-03-15T00:00:00', credit: 130 },
          ],
        },
      },
      errorMatch: 'Early deadline credits must be monotonically decreasing.',
    },
    {
      label: 'late deadline credit at 100% (above 99%)',
      config: { dateControl: { lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 100 }] } },
      errorMatch: 'Late deadline credit must be between 0% and 99%, got 100%.',
    },
    {
      label: 'increasing late deadline credits',
      config: {
        dateControl: {
          lateDeadlines: [
            { date: '2024-03-25T00:00:00', credit: 50 },
            { date: '2024-03-28T00:00:00', credit: 80 },
          ],
        },
      },
      errorMatch: 'Late deadline credits must be monotonically decreasing.',
    },
    {
      label: 'afterLastDeadline credit exceeding last late deadline',
      config: {
        dateControl: {
          dueDate: '2024-03-21T00:00:00',
          lateDeadlines: [
            { date: '2024-03-25T00:00:00', credit: 80 },
            { date: '2024-03-28T00:00:00', credit: 50 },
          ],
          afterLastDeadline: { allowSubmissions: true, credit: 60 },
        },
      },
      errorMatch:
        "After-last-deadline credit (60%) must not exceed the preceding deadline's credit (50%).",
    },
    {
      label: 'afterLastDeadline credit exceeding 100 when no late deadlines',
      config: {
        dateControl: {
          dueDate: '2024-03-21T00:00:00',
          afterLastDeadline: { allowSubmissions: true, credit: 110 },
        },
      },
      errorMatch:
        "After-last-deadline credit (110%) must not exceed the preceding deadline's credit (100%).",
    },
  ])('rejects $label', ({ config, errorMatch }) => {
    const rule = AccessControlJsonSchema.parse(config);
    const errors = validateRuleCreditMonotonicity(rule);
    assert.isTrue(errors.includes(errorMatch));
  });

  it.each([
    {
      label: 'valid decreasing early + late credits',
      config: {
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
      },
    },
    {
      label: 'afterLastDeadline credit equal to last late deadline',
      config: {
        dateControl: {
          dueDate: '2024-03-21T00:00:00',
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 50 }],
          afterLastDeadline: { allowSubmissions: true, credit: 50 },
        },
      },
    },
    {
      label: 'afterLastDeadline credit less than last late deadline',
      config: {
        dateControl: {
          dueDate: '2024-03-21T00:00:00',
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 50 }],
          afterLastDeadline: { allowSubmissions: true, credit: 30 },
        },
      },
    },
    {
      label: 'afterLastDeadline without credit (practice mode)',
      config: {
        dateControl: {
          dueDate: '2024-03-21T00:00:00',
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 50 }],
          afterLastDeadline: { allowSubmissions: true },
        },
      },
    },
    {
      label: 'afterLastDeadline skipped when no due date or late deadlines',
      config: { dateControl: { afterLastDeadline: { allowSubmissions: true, credit: 50 } } },
    },
  ])('accepts $label', ({ config }) => {
    const rule = AccessControlJsonSchema.parse(config);
    assert.deepEqual(validateRuleCreditMonotonicity(rule), []);
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

    assert.isTrue(
      result.errors.includes(
        'No defaults found. The first element of accessControl must apply to everyone.',
      ),
    );
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
    assert.isTrue(
      issues.some(
        (issue) =>
          issue.message === 'Early deadline must be after the earliest possible release date.',
      ),
    );
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

  it('allows global late deadline equal to inherited due date', () => {
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
        rule: AccessControlJsonSchema.parse({
          labels: ['Section A'],
          dateControl: {
            lateDeadlines: [{ date: '2024-04-10T00:00:00', credit: 80 }],
          },
        }),
        targetType: 'student_label',
        ruleIndex: 1,
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
      issues.some(
        (issue) =>
          issue.message === 'Early deadline must be on or before the latest possible due date.',
      ),
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
    assert.isTrue(
      errors.includes('Duplicate PrairieTest exam UUID: 11111111-1111-1111-1111-111111111111.'),
    );
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

  it.each([
    {
      label: 'early deadline dates',
      config: {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
          earlyDeadlines: [
            { date: '2024-03-17T23:59:00', credit: 120 },
            { date: '2024-03-17T23:59:00', credit: 110 },
          ],
        },
      },
      errorMatch: 'Duplicate early deadline date: 2024-03-17T23:59:00.',
    },
    {
      label: 'late deadline dates',
      config: {
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
          lateDeadlines: [
            { date: '2024-03-25T23:59:00', credit: 80 },
            { date: '2024-03-25T23:59:00', credit: 50 },
          ],
        },
      },
      errorMatch: 'Duplicate late deadline date: 2024-03-25T23:59:00.',
    },
  ])('rejects duplicate $label', ({ config, errorMatch }) => {
    const rule = AccessControlJsonSchema.parse(config);
    assert.isTrue(validateRule(rule, 'none').includes(errorMatch));
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
    assert.isTrue(result.errors.includes('Duplicate early deadline date: 2024-03-17T23:59:00.'));
  });
});

describe('afterLastDeadline validation', () => {
  it('should accept allowSubmissions false without credit', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
        afterLastDeadline: {
          allowSubmissions: false,
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
  });

  it('should accept allowSubmissions true without credit', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
        afterLastDeadline: {
          allowSubmissions: true,
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
  });

  it('should accept credit when allowSubmissions is true', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
        afterLastDeadline: {
          allowSubmissions: true,
          credit: 50,
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
  });

  it('should reject numeric credit when allowSubmissions is false', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
        afterLastDeadline: {
          allowSubmissions: false,
          credit: 50,
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.isTrue(
      errors.some((e) =>
        e.includes('afterLastDeadline.credit cannot be set when allowSubmissions is false'),
      ),
    );
  });
});

describe('afterComplete override validation', () => {
  it('should accept omitted visibility fields on overrides', () => {
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        questions: { hidden: true },
        score: { hidden: true },
      },
    });
    const errors = validateRule(rule, 'student_label');
    assert.deepEqual(errors, []);
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
    assert.isTrue(issues.some((i) => i.message === 'Late deadlines require a due date.'));
  });

  it('should reject after-complete dates without any deadline', () => {
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        questions: {
          hidden: true,
          visibleFromDate: '2024-03-23T23:59:00',
        },
        score: {
          hidden: true,
          visibleFromDate: '2024-03-25T23:59:00',
        },
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
          i.message ===
            'After-complete dates require at least one deadline (due date or late deadline).' &&
          JSON.stringify(i.path) ===
            JSON.stringify(['afterComplete', 'questions', 'visibleFromDate']),
      ),
    );
    assert.isTrue(
      issues.some(
        (i) =>
          i.message ===
            'After-complete dates require at least one deadline (due date or late deadline).' &&
          JSON.stringify(i.path) === JSON.stringify(['afterComplete', 'score', 'visibleFromDate']),
      ),
    );
  });

  it.each([
    {
      label: 'after-complete boolean fields without deadlines',
      config: {
        afterComplete: {
          questions: { hidden: true },
          score: { hidden: true },
        },
      },
    },
    {
      label: 'after-complete dates when durationMinutes is set',
      config: {
        dateControl: { durationMinutes: 60 },
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-23T23:59:00',
          },
        },
      },
    },
    {
      label: 'after-complete dates when PrairieTest is configured',
      config: {
        integrations: {
          prairieTest: {
            exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
          },
        },
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-23T23:59:00',
          },
        },
      },
    },
  ])('accepts $label', ({ config }) => {
    const rule = AccessControlJsonSchema.parse(config);
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
    assert.isTrue(result.errors.includes('Late deadlines require a due date.'));
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
    assert.isTrue(issues.some((i) => i.message === 'Late deadlines require a due date.'));
  });
});

describe('AccessControlJsonSchema nullable override fields', () => {
  it('accepts explicit nulls used to clear inherited override fields', () => {
    const result = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: null,
        earlyDeadlines: null,
        lateDeadlines: null,
        afterLastDeadline: { allowSubmissions: true },
        durationMinutes: null,
        password: null,
      },
    });

    assert.equal(result.dateControl?.releaseDate, '2024-03-14T00:01:00');
    assert.deepEqual(result.dateControl?.afterLastDeadline, { allowSubmissions: true });
    assert.isNull(result.dateControl?.durationMinutes);
  });
});

describe('afterComplete hidden/visibility validation', () => {
  it('rejects questions hidden: false with visibleFromDate', () => {
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        questions: {
          hidden: false,
          visibleFromDate: '2024-03-25T00:00:00',
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.isTrue(
      errors.some((e) => e.includes('afterComplete.questions cannot have visibleFromDate')),
    );
  });

  it('rejects questions hidden: false with visibleUntilDate', () => {
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        questions: {
          hidden: false,
          visibleUntilDate: '2024-03-30T00:00:00',
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.isTrue(
      errors.some((e) =>
        e.includes('afterComplete.questions cannot have visibleFromDate or visibleUntilDate'),
      ),
    );
  });

  it('accepts questions visibleUntilDate without visibleFromDate', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
      },
      afterComplete: {
        questions: {
          hidden: true,
          visibleUntilDate: '2024-03-30T00:00:00',
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
  });

  it('rejects score hidden: false with visibleFromDate', () => {
    const rule = AccessControlJsonSchema.parse({
      afterComplete: {
        score: {
          hidden: false,
          visibleFromDate: '2024-03-25T00:00:00',
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.isTrue(
      errors.some((e) => e.includes('afterComplete.score cannot have visibleFromDate')),
    );
  });
});
