import { assert, describe, it } from 'vitest';

import {
  type AccessControlJsonInput,
  AccessControlJsonSchema,
  MAX_ENROLLMENT_ACCESS_CONTROL_RULES,
  MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES,
} from '../../schemas/accessControl.js';

import {
  type AccessControlValidationRule,
  validateAccessControlRules,
  validateAfterCompleteCrossFieldIssues,
  validateGlobalCreditConsistencyIssues,
  validateGlobalDateConsistencyIssues,
  validateGlobalStructuralDependencyIssues,
  validateRule,
  validateRuleCreditOrdering,
  validateRuleDateOrdering,
  validateRuleStructuralDependencyIssues,
} from './validation.js';

const CREDIT_ORDERING_MESSAGE =
  'Credit must strictly decrease at every boundary, except that the first late deadline—or after-due credit when there are no late deadlines—may match due-date credit.';

function uuidForIndex(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

describe('Valid configs', () => {
  const validAccessControlExamples: AccessControlJsonInput[][] = [
    // Example 1: Homework with early/late deadlines
    [
      {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
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
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
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
              { examUuid: '450a7084-360e-4801-b89e-24a1584c885f', readOnly: true },
            ],
          },
        },
      },
    ],

    // Example 5: Extended time override
    [
      {
        // Default rule (no targets)
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
          durationMinutes: 60,
        },
      },
      {
        // Individual override
        uuid: '11111111-1111-4111-8111-111111111111',
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
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
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
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
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
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
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

describe('Default rule requirement', () => {
  it('should fail validation when no default rule exists', () => {
    const rulesWithoutDefault: AccessControlJsonInput[] = [
      {
        uuid: '11111111-1111-4111-8111-111111111111',
        labels: ['student1'],
        dateControl: {
          durationMinutes: 90,
        },
      },
      {
        uuid: '22222222-2222-4222-8222-222222222222',
        labels: ['student2'],
        dateControl: {
          durationMinutes: 120,
        },
      },
    ];

    const parsedRules = rulesWithoutDefault.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({
      rules: parsedRules,
    });

    assert.isTrue(result.errors.length > 0, 'Expected error when no default rule exists');
    assert.isTrue(
      result.errors.includes(
        'No defaults found. The first element of accessControl must apply to everyone.',
      ),
      `Expected "No defaults found" error, but got: ${result.errors.join(', ')}`,
    );
  });

  it('should pass validation with exactly one default rule', () => {
    const rulesWithOneDefault: AccessControlJsonInput[] = [
      {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
    ];

    const parsedRules = rulesWithOneDefault.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({
      rules: parsedRules,
    });

    assert.equal(result.errors.length, 0, 'Should have no errors with one default rule');
  });

  it('should fail validation when an override specifies beforeRelease', () => {
    const rules: AccessControlJsonInput[] = [
      {
        beforeRelease: { listed: false },
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
      {
        labels: ['student1'],
        beforeRelease: { listed: true },
        dateControl: {
          due: { date: '2024-03-22T23:59:00' },
        },
      },
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({
      rules: parsedRules,
    });

    assert.isTrue(
      result.errors.some((err) => err.includes('beforeRelease can only be specified')),
      `Expected beforeRelease validation error, but got: ${result.errors.join(', ')}`,
    );
  });
});

describe('rule UUID validation', () => {
  it('accepts trailing unlabeled student-specific overrides when all non-default rules have UUIDs', () => {
    const rules: AccessControlJsonInput[] = [
      {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
      {
        uuid: '22222222-2222-4222-8222-222222222222',
        labels: ['Section A'],
        dateControl: { durationMinutes: 90 },
      },
      {
        uuid: '33333333-3333-4333-8333-333333333333',
        dateControl: { durationMinutes: 120 },
      },
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({ rules: parsedRules });

    assert.deepEqual(result.errors, []);
  });

  it('rejects too many student-label overrides', () => {
    const rules: AccessControlJsonInput[] = [
      {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
      ...Array.from({ length: MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES + 1 }, (_, i) => ({
        uuid: uuidForIndex(i),
        labels: [`Section ${i}`],
        dateControl: { durationMinutes: 90 },
      })),
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({ rules: parsedRules });

    assert.include(
      result.errors,
      `An assessment can have at most ${MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES} student-label access control overrides.`,
    );
  });

  it('rejects too many student-specific overrides', () => {
    const rules: AccessControlJsonInput[] = [
      {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
      ...Array.from({ length: MAX_ENROLLMENT_ACCESS_CONTROL_RULES + 1 }, (_, i) => ({
        uuid: uuidForIndex(i),
        dateControl: { durationMinutes: 90 },
      })),
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({ rules: parsedRules });

    assert.include(
      result.errors,
      `An assessment can have at most ${MAX_ENROLLMENT_ACCESS_CONTROL_RULES} student-specific access control overrides.`,
    );
  });

  it('rejects non-default rules without UUIDs', () => {
    const rules: AccessControlJsonInput[] = [
      {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
      {
        dateControl: { durationMinutes: 120 },
      },
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({ rules: parsedRules });

    assert.include(result.errors, 'Every non-default accessControl rule must specify uuid.');
  });

  it('rejects duplicate non-default rule UUIDs', () => {
    const rules: AccessControlJsonInput[] = [
      {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
      {
        uuid: '22222222-2222-4222-8222-222222222222',
        labels: ['Section A'],
        dateControl: { durationMinutes: 90 },
      },
      {
        uuid: '22222222-2222-4222-8222-222222222222',
        dateControl: { durationMinutes: 120 },
      },
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({ rules: parsedRules });

    assert.include(
      result.errors,
      'Found duplicate access control rule UUIDs: "22222222-2222-4222-8222-222222222222".',
    );
  });

  it('rejects student-label UUID rules after student-specific UUID rules', () => {
    const rules: AccessControlJsonInput[] = [
      {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
      {
        uuid: '22222222-2222-4222-8222-222222222222',
        dateControl: { durationMinutes: 120 },
      },
      {
        uuid: '33333333-3333-4333-8333-333333333333',
        labels: ['Section A'],
        dateControl: { durationMinutes: 90 },
      },
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({ rules: parsedRules });

    assert.include(
      result.errors,
      'Student-label access control rules must appear before student-specific access control rules.',
    );
  });

  it('rejects UUIDs on the default rule', () => {
    const rules: AccessControlJsonInput[] = [
      {
        uuid: '11111111-1111-4111-8111-111111111111',
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
        },
      },
    ];

    const parsedRules = rules.map((rule) => AccessControlJsonSchema.parse(rule));
    const result = validateAccessControlRules({ rules: parsedRules });

    assert.include(
      result.errors,
      'uuid can only be specified on non-default access control rules.',
    );
  });
});

describe('Date fields without seconds', () => {
  it('should accept and transform dates without seconds', () => {
    const ruleWithDateWithoutSeconds: AccessControlJsonInput = {
      dateControl: {
        release: { date: '2024-03-14T00:01' }, // No seconds
        due: { date: '2024-03-21T23:59' }, // No seconds
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

    assert.equal(parsed.dateControl?.release?.date, '2024-03-14T00:01:00');
    assert.equal(parsed.dateControl?.due?.date, '2024-03-21T23:59:00');
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
        release: { date: '2024-03-14T00:01:00' }, // With seconds
        due: { date: '2024-03-21T23:59:00' }, // With seconds
      },
    };

    const parsed = AccessControlJsonSchema.parse(ruleWithDateWithSeconds);

    assert.equal(parsed.dateControl?.release?.date, '2024-03-14T00:01:00');
    assert.equal(parsed.dateControl?.due?.date, '2024-03-21T23:59:00');

    const result = validateAccessControlRules({
      rules: [parsed],
    });
    assert.deepEqual(result.errors, [], `Expected no errors, but got: ${result.errors.join(', ')}`);
  });
});

describe('Date fields must be dates', () => {
  it.each([
    {
      label: 'release.date',
      config: { dateControl: { release: { date: 'NOTADATE' } } },
      expectedPath: ['dateControl', 'release', 'date'],
    },
    {
      label: 'showQuestionsAgainDate',
      config: {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
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
      config: { dateControl: { earlyDeadlines: [{ date: 'NOTADATE', credit: 101 }] } },
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

describe('Deadline credit schema validation', () => {
  it.each([
    {
      label: 'minimum bonus credit on an early deadline',
      dateControl: { earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit: 101 }] },
    },
    {
      label: '100% credit on a late deadline',
      dateControl: { lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 100 }] },
    },
    {
      label: '100% credit after the due date',
      dateControl: { afterLastDeadline: { allowSubmissions: true as const, credit: 100 } },
    },
  ])('accepts $label', ({ dateControl }) => {
    assert.isTrue(AccessControlJsonSchema.safeParse({ dateControl }).success);
  });

  it.each([
    {
      label: 'early deadline credit at or below 100%',
      dateControl: { earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit: 100 }] },
    },
    {
      label: 'late deadline credit above 100%',
      dateControl: { lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 101 }] },
    },
    {
      label: 'after-due credit above 100%',
      dateControl: { afterLastDeadline: { allowSubmissions: true as const, credit: 101 } },
    },
  ])('rejects $label', ({ dateControl }) => {
    assert.isFalse(AccessControlJsonSchema.safeParse({ dateControl }).success);
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

describe('PrairieTest exam afterComplete validation', () => {
  const validUuid = '11e89892-3eff-4d7f-90a2-221372f14e5c';
  const readOnlyNoHideError = `PrairieTest exam ${validUuid}: readOnly: true cannot be combined with afterComplete.questions.hidden: true or afterComplete.score.hidden: true (a readOnly reservation is a review environment).`;
  const ptScoreRequiresQuestionsError = `PrairieTest exam ${validUuid}: afterComplete.score.hidden: true requires afterComplete.questions.hidden: true.`;

  it.each([
    {
      label: 'readOnly: true combined with afterComplete.questions.hidden: true',
      exam: {
        examUuid: validUuid,
        readOnly: true,
        afterComplete: { questions: { hidden: true } },
      },
      errorMessage: readOnlyNoHideError,
    },
    {
      label: 'readOnly: true combined with afterComplete.score.hidden: true',
      exam: {
        examUuid: validUuid,
        readOnly: true,
        afterComplete: { questions: { hidden: true }, score: { hidden: true } },
      },
      errorMessage: readOnlyNoHideError,
    },
    {
      label: 'score.hidden: true without questions.hidden: true',
      exam: {
        examUuid: validUuid,
        afterComplete: { score: { hidden: true } },
      },
      errorMessage: ptScoreRequiresQuestionsError,
    },
    {
      label: 'score.hidden: true with questions.hidden: false',
      exam: {
        examUuid: validUuid,
        afterComplete: { questions: { hidden: false }, score: { hidden: true } },
      },
      errorMessage: ptScoreRequiresQuestionsError,
    },
  ])('rejects $label', ({ exam, errorMessage }) => {
    const errors = validateRule({ integrations: { prairieTest: { exams: [exam] } } }, 'none');
    assert.isTrue(errors.includes(errorMessage));
  });

  it.each([
    {
      label: 'readOnly: true with afterComplete.questions.hidden: false (no-op)',
      exam: {
        examUuid: validUuid,
        readOnly: true,
        afterComplete: { questions: { hidden: false } },
      },
    },
    {
      label: 'readOnly: true without afterComplete',
      exam: { examUuid: validUuid, readOnly: true },
    },
    {
      label: 'non-readOnly with afterComplete.questions.hidden: true',
      exam: {
        examUuid: validUuid,
        afterComplete: { questions: { hidden: true } },
      },
    },
    {
      label: 'both questions.hidden: true and score.hidden: true',
      exam: {
        examUuid: validUuid,
        afterComplete: { questions: { hidden: true }, score: { hidden: true } },
      },
    },
  ])('accepts $label', ({ exam }) => {
    const errors = validateRule({ integrations: { prairieTest: { exams: [exam] } } }, 'none');
    assert.deepEqual(errors, []);
  });
});

describe('Date ordering validation', () => {
  it.each([
    {
      label: 'release date after due date',
      config: {
        dateControl: {
          release: { date: '2024-03-25T00:00:00' },
          due: { date: '2024-03-20T00:00:00' },
        },
      },
      errorMatch: 'Release date must be before due date.',
    },
    {
      label: 'early deadline after due date',
      config: {
        dateControl: {
          due: { date: '2024-03-20T00:00:00' },
          earlyDeadlines: [{ date: '2024-03-25T00:00:00', credit: 120 }],
        },
      },
      errorMatch: 'Early deadline date 2024-03-25T00:00:00 must be on or before the due date.',
    },
    {
      label: 'early deadline before release date',
      config: {
        dateControl: {
          release: { date: '2024-03-20T00:00:00' },
          earlyDeadlines: [{ date: '2024-03-19T00:00:00', credit: 120 }],
        },
      },
      errorMatch: 'Early deadline date 2024-03-19T00:00:00 must be after the release date.',
    },
    {
      label: 'late deadline before due date',
      config: {
        dateControl: {
          due: { date: '2024-03-20T00:00:00' },
          lateDeadlines: [{ date: '2024-03-18T00:00:00', credit: 80 }],
        },
      },
      errorMatch: 'Late deadline date 2024-03-18T00:00:00 must be on or after the due date.',
    },
    {
      label: 'late deadline before release date',
      config: {
        dateControl: {
          release: { date: '2024-03-20T00:00:00' },
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
          due: { date: '2024-03-20T00:00:00' },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
        },
        afterComplete: { questions: { hidden: true, visibleFromDate: '2024-03-23T00:00:00' } },
      },
      errorMatch: 'Show questions again date must be after the last deadline.',
    },
    {
      label: 'visibleFromDate before due date (no late deadlines) for questions',
      config: {
        dateControl: { due: { date: '2024-03-20T00:00:00' } },
        afterComplete: { questions: { hidden: true, visibleFromDate: '2024-03-19T00:00:00' } },
      },
      errorMatch: 'Show questions again date must be after the last deadline.',
    },
    {
      label: 'visibleFromDate before last deadline for score',
      config: {
        dateControl: {
          due: { date: '2024-03-20T00:00:00' },
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
          due: { date: '2024-03-20T00:00:00' },
          earlyDeadlines: [{ date: '2024-03-20T00:00:00', credit: 120 }],
        },
      },
    },
    {
      label: 'late deadline equal to due date',
      config: {
        dateControl: {
          due: { date: '2024-03-20T00:00:00' },
          lateDeadlines: [{ date: '2024-03-20T00:00:00', credit: 80 }],
        },
      },
    },
    {
      label: 'visibleFromDate after last deadline for questions',
      config: {
        dateControl: {
          due: { date: '2024-03-20T00:00:00' },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
        },
        afterComplete: { questions: { hidden: true, visibleFromDate: '2024-03-26T00:00:00' } },
      },
    },
    {
      label: 'visibleFromDate after last deadline for score',
      config: {
        dateControl: { due: { date: '2024-03-20T00:00:00' } },
        afterComplete: { score: { hidden: true, visibleFromDate: '2024-03-21T00:00:00' } },
      },
    },
    {
      label: 'show-again dates skipped when no due date',
      config: {
        dateControl: { release: { date: '2024-03-10T00:00:00' } },
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
          release: { date: '2024-03-10T00:00:00' },
          due: { date: '2024-03-20T00:00:00' },
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

describe('Credit ordering validation', () => {
  it.each([
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
    },
    {
      label: 'equal early deadline credits',
      config: {
        dateControl: {
          earlyDeadlines: [
            { date: '2024-03-12T00:00:00', credit: 120 },
            { date: '2024-03-15T00:00:00', credit: 120 },
          ],
        },
      },
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
    },
    {
      label: 'afterLastDeadline credit exceeding last late deadline',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00' },
          lateDeadlines: [
            { date: '2024-03-25T00:00:00', credit: 80 },
            { date: '2024-03-28T00:00:00', credit: 50 },
          ],
          afterLastDeadline: { allowSubmissions: true, credit: 60 },
        },
      },
    },
    {
      label: 'consecutive late deadlines with equal credit',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00' },
          lateDeadlines: [
            { date: '2024-03-25T00:00:00', credit: 100 },
            { date: '2024-03-28T00:00:00', credit: 100 },
          ],
        },
      },
    },
    {
      label: 'afterLastDeadline credit equal to last late deadline',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00' },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 100 }],
          afterLastDeadline: { allowSubmissions: true, credit: 100 },
        },
      },
    },
  ])('rejects $label', ({ config }) => {
    const rule = AccessControlJsonSchema.parse(config);
    const errors = validateRuleCreditOrdering(rule);
    assert.isTrue(errors.includes(CREDIT_ORDERING_MESSAGE));
  });

  it.each([
    {
      label: 'early deadline credit above default due credit',
      config: { dateControl: { earlyDeadlines: [{ date: '2024-03-15T00:00:00', credit: 110 }] } },
    },
    {
      label: 'late deadline credit below 100% under bonus due credit',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00', credit: 110 },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 99 }],
        },
      },
    },
    {
      label: 'late deadline credit at 100% under bonus due credit',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00', credit: 110 },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 100 }],
        },
      },
    },
    {
      label: 'late deadline credit equal to custom due credit',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00', credit: 80 },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 80 }],
        },
      },
    },
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
      label: 'late deadline credit just below custom due credit',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00', credit: 80 },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 79 }],
        },
      },
    },
    {
      label: 'afterLastDeadline credit less than last late deadline',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00' },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 50 }],
          afterLastDeadline: { allowSubmissions: true, credit: 30 },
        },
      },
    },
    {
      label: 'full-credit grace period until a late deadline',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00' },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 100 }],
        },
      },
    },
    {
      label: 'full credit after the due date without late deadlines',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00' },
          afterLastDeadline: { allowSubmissions: true, credit: 100 },
        },
      },
    },
    {
      label: 'afterLastDeadline with zero credit (practice mode)',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00' },
          lateDeadlines: [{ date: '2024-03-25T00:00:00', credit: 50 }],
          afterLastDeadline: { allowSubmissions: true, credit: 0 },
        },
      },
    },
    {
      label: 'afterLastDeadline skipped when no due date or late deadlines',
      config: { dateControl: { afterLastDeadline: { allowSubmissions: true, credit: 50 } } },
    },
  ])('accepts $label', ({ config }) => {
    const rule = AccessControlJsonSchema.parse(config);
    assert.deepEqual(validateRuleCreditOrdering(rule), []);
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

  it('allows inert student-label rules with no labels by default', () => {
    const result = validateAccessControlRules({
      rules: [
        AccessControlJsonSchema.parse({}),
        AccessControlJsonSchema.parse({
          uuid: '11111111-1111-4111-8111-111111111111',
          labels: [],
          dateControl: {
            durationMinutes: 90,
          },
        }),
      ],
    });

    assert.deepEqual(result.errors, []);
  });
});

describe('Global temporal validation', () => {
  it('rejects an early deadline before the earliest possible release date', () => {
    const issues = validateGlobalDateConsistencyIssues([
      {
        rule: AccessControlJsonSchema.parse({
          dateControl: {
            release: { date: '2024-04-07T00:00:00' },
          },
        }),
        targetType: 'none',
        ruleIndex: 0,
      },
      {
        rule: AccessControlJsonSchema.parse({
          labels: ['Section A'],
          dateControl: {
            release: { date: '2024-04-06T00:00:00' },
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
            release: { date: '2024-04-07T00:00:00' },
            due: { date: '2024-04-08T00:00:00' },
          },
        }),
        targetType: 'none',
        ruleIndex: 0,
      },
      {
        rule: AccessControlJsonSchema.parse({
          labels: ['Section A'],
          dateControl: {
            due: { date: null },
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
            release: { date: '2024-04-07T00:00:00' },
            due: { date: '2024-04-10T00:00:00' },
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
            release: { date: '2024-04-07T00:00:00' },
            due: { date: '2024-04-10T00:00:00' },
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

describe('Global credit validation', () => {
  const validationRule = (
    rule: AccessControlJsonInput,
    ruleIndex: number,
  ): AccessControlValidationRule => ({
    rule: AccessControlJsonSchema.parse(rule),
    targetType: ruleIndex === 0 ? 'none' : 'student_label',
    ruleIndex,
  });

  const messagesFor = (...rules: AccessControlJsonInput[]) =>
    validateGlobalCreditConsistencyIssues(
      rules.map((rule, ruleIndex) => validationRule(rule, ruleIndex)),
    ).map((issue) => issue.message);

  it('rejects override late deadline credit above inherited due credit', () => {
    const messages = messagesFor(
      {
        dateControl: {
          due: { date: '2024-04-10T00:00:00', credit: 80 },
        },
      },
      {
        labels: ['Section A'],
        dateControl: {
          lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 90 }],
        },
      },
    );

    assert.isTrue(messages.includes(CREDIT_ORDERING_MESSAGE));
  });

  it('accepts override late deadline credit equal to inherited due credit', () => {
    const messages = messagesFor(
      {
        dateControl: {
          due: { date: '2024-04-10T00:00:00', credit: 80 },
        },
      },
      {
        labels: ['Section A'],
        dateControl: {
          lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 80 }],
        },
      },
    );

    assert.deepEqual(messages, []);
  });

  it('uses inherited default due credit to reject override early deadlines', () => {
    const messages = messagesFor(
      {
        dateControl: {
          due: { date: '2024-04-10T00:00:00', credit: 80 },
        },
      },
      {
        labels: ['Section A'],
        dateControl: {
          earlyDeadlines: [{ date: '2024-04-09T00:00:00', credit: 110 }],
        },
      },
    );

    assert.isTrue(
      messages.includes('Early deadlines are not allowed when due date credit is below 100%.'),
    );
  });

  it('does not check enrollment rules against unrelated student-label overrides', () => {
    const issues = validateGlobalCreditConsistencyIssues([
      validationRule({ dateControl: { due: { date: '2024-04-10T00:00:00', credit: 110 } } }, 0),
      validationRule(
        {
          labels: ['Section A'],
          dateControl: {
            due: { date: '2024-04-10T00:00:00', credit: 80 },
          },
        },
        1,
      ),
      {
        rule: AccessControlJsonSchema.parse({
          dateControl: {
            lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 99 }],
          },
        }),
        targetType: 'enrollment',
        ruleIndex: 2,
      },
    ]);

    assert.deepEqual(issues, []);
  });

  it('rejects afterLastDeadline credit equal to an inherited late deadline', () => {
    const messages = messagesFor(
      {
        dateControl: {
          due: { date: '2024-04-10T00:00:00' },
          lateDeadlines: [{ date: '2024-04-11T00:00:00', credit: 50 }],
        },
      },
      {
        labels: ['Section A'],
        dateControl: {
          afterLastDeadline: { allowSubmissions: true, credit: 50 },
        },
      },
    );

    assert.isTrue(messages.includes(CREDIT_ORDERING_MESSAGE));
  });

  it('accepts afterLastDeadline credit equal to inherited due credit without late deadlines', () => {
    const messages = messagesFor(
      {
        dateControl: {
          due: { date: '2024-04-10T00:00:00' },
        },
      },
      {
        labels: ['Section A'],
        dateControl: {
          afterLastDeadline: { allowSubmissions: true, credit: 100 },
        },
      },
    );

    assert.deepEqual(messages, []);
  });
});

describe('Duplicate detection', () => {
  it('should reject duplicate PrairieTest exam UUIDs', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: null },
      },
      integrations: {
        prairieTest: {
          exams: [
            { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34' },
            { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34' },
          ],
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.isTrue(
      errors.includes('Duplicate PrairieTest exam UUID: 8d38a804-7858-49a6-abe7-7a057604dd34.'),
    );
  });

  it('should accept unique PrairieTest exam UUIDs', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: null },
      },
      integrations: {
        prairieTest: {
          exams: [
            { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34' },
            { examUuid: 'bffd5230-43a5-4be8-a87c-c43b5525bc65' },
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
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
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
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
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
          release: { date: '2024-03-14T00:01:00' },
          due: { date: '2024-03-21T23:59:00' },
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
        release: { date: '2024-03-14T00:01:00' },
        due: { date: '2024-03-21T23:59:00' },
        afterLastDeadline: {
          allowSubmissions: false,
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
  });

  it('should accept zero credit when allowSubmissions is true', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: '2024-03-21T23:59:00' },
        afterLastDeadline: {
          allowSubmissions: true,
          credit: 0,
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
  });

  it('should accept credit when allowSubmissions is true', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: '2024-03-21T23:59:00' },
        afterLastDeadline: {
          allowSubmissions: true,
          credit: 50,
        },
      },
    });
    const errors = validateRule(rule, 'none');
    assert.deepEqual(errors, []);
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
  it('should accept early deadlines with an explicit null due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        due: { date: null },
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

  it('should reject late deadlines with an explicit null due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        due: { date: null },
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

  it.each([
    {
      label: 'afterComplete dates without dateControl',
      config: {
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
      },
    },
    {
      label: 'afterComplete dates with dateControl but no deadlines',
      config: {
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
        },
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
      },
    },
    {
      label: 'early deadlines when custom due credit is at least 100%',
      config: {
        dateControl: {
          due: { date: '2024-03-21T00:00:00', credit: 110 },
          earlyDeadlines: [{ date: '2024-03-10T00:00:00', credit: 120 }],
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

  it('should reject early deadlines when due credit is below 100%', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        due: { date: '2024-03-21T00:00:00', credit: 80 },
        earlyDeadlines: [{ date: '2024-03-10T00:00:00', credit: 110 }],
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.isTrue(
      issues.some(
        (i) => i.message === 'Early deadlines are not allowed when due date credit is below 100%.',
      ),
    );
  });

  it('should surface structural errors through validateAccessControlRules', () => {
    const rules = [
      AccessControlJsonSchema.parse({
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
        },
      }),
    ];
    const result = validateAccessControlRules({ rules });
    assert.isTrue(result.errors.includes('Late deadlines require a due date.'));
  });

  it('should allow overrides to inherit due date from default rule', () => {
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
        due: { date: null },
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

  it('should reject afterLastDeadline practice mode with an explicit null due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        due: { date: null },
        afterLastDeadline: { allowSubmissions: true, credit: 0 },
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.isTrue(
      issues.some((i) => i.message === 'After-last-deadline behavior requires a due date.'),
    );
  });

  it('should accept afterLastDeadline no_submissions mode with an explicit null due date', () => {
    const rule = AccessControlJsonSchema.parse({
      dateControl: {
        due: { date: null },
        afterLastDeadline: { allowSubmissions: false },
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'none',
      ruleIndex: 0,
    });
    assert.deepEqual(issues, []);
  });

  it('should reject overrides that explicitly clear due date with afterLastDeadline practice mode', () => {
    const rule = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        due: { date: null },
        afterLastDeadline: { allowSubmissions: true, credit: 0 },
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'student_label',
      ruleIndex: 1,
    });
    assert.isTrue(
      issues.some((i) => i.message === 'After-last-deadline behavior requires a due date.'),
    );
  });

  it('should allow overrides to inherit due date for afterLastDeadline practice mode', () => {
    const rule = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        afterLastDeadline: { allowSubmissions: true, credit: 0 },
      },
    });
    const issues = validateRuleStructuralDependencyIssues({
      rule,
      targetType: 'student_label',
      ruleIndex: 1,
    });
    assert.deepEqual(issues, []);
  });
});

describe('Global structural dependency validation', () => {
  it('flags override late deadlines when default has no due and override does not override due', () => {
    const defaultRule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: null },
      },
    });
    const override = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
      },
    });
    const issues = validateGlobalStructuralDependencyIssues([
      { rule: defaultRule, targetType: 'none', ruleIndex: 0 },
      { rule: override, targetType: 'student_label', ruleIndex: 1 },
    ]);
    assert.isTrue(
      issues.some(
        (i) =>
          i.ruleIndex === 1 &&
          i.message === 'Late deadlines require a due date on at least one rule.',
      ),
    );
  });

  it('accepts override late deadlines when default has a due date', () => {
    const defaultRule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: '2024-03-21T23:59:00' },
      },
    });
    const override = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
      },
    });
    const issues = validateGlobalStructuralDependencyIssues([
      { rule: defaultRule, targetType: 'none', ruleIndex: 0 },
      { rule: override, targetType: 'student_label', ruleIndex: 1 },
    ]);
    assert.deepEqual(issues, []);
  });

  it('accepts override late deadlines when the override sets its own due date', () => {
    const defaultRule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: null },
      },
    });
    const override = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        due: { date: '2024-03-21T23:59:00' },
        lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
      },
    });
    const issues = validateGlobalStructuralDependencyIssues([
      { rule: defaultRule, targetType: 'none', ruleIndex: 0 },
      { rule: override, targetType: 'student_label', ruleIndex: 1 },
    ]);
    assert.deepEqual(issues, []);
  });

  it('flags afterLastDeadline practice mode when no rule has a due date', () => {
    const defaultRule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: null },
      },
    });
    const override = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        afterLastDeadline: { allowSubmissions: true, credit: 0 },
      },
    });
    const issues = validateGlobalStructuralDependencyIssues([
      { rule: defaultRule, targetType: 'none', ruleIndex: 0 },
      { rule: override, targetType: 'student_label', ruleIndex: 1 },
    ]);
    assert.isTrue(
      issues.some(
        (i) =>
          i.ruleIndex === 1 &&
          i.message === 'After-last-deadline behavior requires a due date on at least one rule.',
      ),
    );
  });

  it('does not flag afterLastDeadline no_submissions mode without a due date', () => {
    const defaultRule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: null },
      },
    });
    const override = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        afterLastDeadline: { allowSubmissions: false },
      },
    });
    const issues = validateGlobalStructuralDependencyIssues([
      { rule: defaultRule, targetType: 'none', ruleIndex: 0 },
      { rule: override, targetType: 'student_label', ruleIndex: 1 },
    ]);
    assert.deepEqual(issues, []);
  });

  it('does not flag rules without late deadlines or afterLastDeadline', () => {
    const defaultRule = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: null },
      },
    });
    const override = AccessControlJsonSchema.parse({
      labels: ['Section A'],
      dateControl: {
        password: 'secret',
      },
    });
    const issues = validateGlobalStructuralDependencyIssues([
      { rule: defaultRule, targetType: 'none', ruleIndex: 0 },
      { rule: override, targetType: 'student_label', ruleIndex: 1 },
    ]);
    assert.deepEqual(issues, []);
  });

  it('surfaces through validateAccessControlRules end-to-end', () => {
    const rules = [
      AccessControlJsonSchema.parse({
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: null },
        },
      }),
      AccessControlJsonSchema.parse({
        labels: ['Section A'],
        dateControl: {
          lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
        },
      }),
    ];
    const result = validateAccessControlRules({ rules });
    assert.isTrue(
      result.errors.includes('Late deadlines require a due date on at least one rule.'),
    );
  });

  it('does not duplicate when an override explicitly clears its own due date', () => {
    // The per-rule validator already flags an override with `due: { date: null }`
    // and lateDeadlines/afterLastDeadline. The global check should defer to it
    // rather than emit a second error at the same path.
    const rules = [
      AccessControlJsonSchema.parse({
        dateControl: {
          release: { date: '2024-03-14T00:01:00' },
          due: { date: null },
        },
      }),
      AccessControlJsonSchema.parse({
        labels: ['Section A'],
        dateControl: {
          due: { date: null },
          lateDeadlines: [{ date: '2024-03-25T23:59:00', credit: 80 }],
          afterLastDeadline: { allowSubmissions: true, credit: 0 },
        },
      }),
    ];
    const result = validateAccessControlRules({ rules });
    assert.isTrue(result.errors.includes('Late deadlines require a due date.'));
    assert.isTrue(result.errors.includes('After-last-deadline behavior requires a due date.'));
    assert.isFalse(
      result.errors.includes('Late deadlines require a due date on at least one rule.'),
    );
    assert.isFalse(
      result.errors.includes(
        'After-last-deadline behavior requires a due date on at least one rule.',
      ),
    );
  });
});

describe('AccessControlJsonSchema nullable override fields', () => {
  it('accepts explicit nulls used to clear inherited override fields', () => {
    const result = AccessControlJsonSchema.parse({
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: null },
        earlyDeadlines: null,
        lateDeadlines: null,
        afterLastDeadline: { allowSubmissions: true, credit: 0 },
        durationMinutes: null,
        password: null,
      },
    });

    assert.equal(result.dateControl?.release?.date, '2024-03-14T00:01:00');
    assert.deepEqual(result.dateControl?.afterLastDeadline, { allowSubmissions: true, credit: 0 });
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
        release: { date: '2024-03-14T00:01:00' },
        due: { date: '2024-03-21T23:59:00' },
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

describe('afterComplete cross-field validation', () => {
  interface ExpectedIssue {
    ruleIndex: number;
    message: RegExp;
  }

  function buildRules(jsons: AccessControlJsonInput[]): AccessControlValidationRule[] {
    return jsons.map((json, ruleIndex) => ({
      rule: AccessControlJsonSchema.parse(json),
      targetType: ruleIndex === 0 ? 'none' : 'student_label',
      ruleIndex,
    }));
  }

  it.each([
    {
      label: 'empty rule list',
      rules: [],
      issues: [],
    },
    {
      label: 'default rule with all-default visibility',
      rules: [{}],
      issues: [],
    },
    {
      label: 'default rule: score hidden but questions visible',
      rules: [{ afterComplete: { questions: { hidden: false }, score: { hidden: true } } }],
      issues: [
        {
          ruleIndex: 0,
          message: /Questions cannot be made visible after completion while the score is hidden/,
        },
      ],
    },
    {
      label: 'default rule: questions reveal but score never becomes visible',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true },
          },
        },
      ],
      issues: [
        {
          ruleIndex: 0,
          message:
            /Questions cannot become visible after completion while the score remains hidden/,
        },
      ],
    },
    {
      label: 'default rule: score reveals after questions',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-15T00:00:00' },
          },
        },
      ],
      issues: [
        {
          ruleIndex: 0,
          message: /score must become visible on or before the question reveal date/,
        },
      ],
    },
    {
      label: 'default rule: score reveals on the same date questions do (boundary)',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
          },
        },
      ],
      issues: [],
    },
    {
      label: 'override-score conflicts with inherited questions',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
          },
        },
        {
          labels: ['A'],
          afterComplete: { score: { hidden: true, visibleFromDate: '2024-04-15T00:00:00' } },
        },
      ],
      issues: [
        {
          ruleIndex: 1,
          message: /score must become visible on or before the question reveal date/,
        },
      ],
    },
    {
      label: 'override-questions earlier than inherited score',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-08T00:00:00' },
          },
        },
        {
          labels: ['A'],
          afterComplete: { questions: { hidden: true, visibleFromDate: '2024-04-06T00:00:00' } },
        },
      ],
      issues: [
        {
          ruleIndex: 1,
          message: /score must become visible on or before the question reveal date/,
        },
      ],
    },
    {
      label: 'override-questions later than inherited score',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-08T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-05T00:00:00' },
          },
        },
        {
          labels: ['A'],
          afterComplete: { questions: { hidden: true, visibleFromDate: '2024-04-12T00:00:00' } },
        },
      ],
      issues: [],
    },
    {
      label: 'override-score earlier than inherited questions',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-09T00:00:00' },
          },
        },
        {
          labels: ['A'],
          afterComplete: { score: { hidden: true, visibleFromDate: '2024-04-05T00:00:00' } },
        },
      ],
      issues: [],
    },
    {
      label: 'override-both consistent',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-09T00:00:00' },
          },
        },
        {
          labels: ['A'],
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-20T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-18T00:00:00' },
          },
        },
      ],
      issues: [],
    },
    {
      label: 'override-both with score reveal after questions',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-09T00:00:00' },
          },
        },
        {
          labels: ['A'],
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-15T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-20T00:00:00' },
          },
        },
      ],
      issues: [
        {
          ruleIndex: 1,
          message: /score must become visible on or before the question reveal date/,
        },
      ],
    },
    {
      label: 'override flips questions visible while inheriting hidden-forever score',
      rules: [
        { afterComplete: { score: { hidden: true } } },
        { labels: ['A'], afterComplete: { questions: { hidden: false } } },
      ],
      issues: [
        {
          ruleIndex: 1,
          message: /Questions cannot be made visible after completion while the score is hidden/,
        },
      ],
    },
    {
      // afterComplete.questions is inherited as a whole object, not
      // field-by-field: an override that sets questions without dates does
      // NOT inherit the default's visibleFromDate, so the override's
      // effective questions has no reveal date and no conflict.
      label: 'override replaces questions wholesale (does not inherit visibleFromDate)',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true },
          },
        },
        { labels: ['A'], afterComplete: { questions: { hidden: true } } },
      ],
      issues: [
        {
          ruleIndex: 0,
          message:
            /Questions cannot become visible after completion while the score remains hidden/,
        },
      ],
    },
    {
      label: 'override-score hidden forever with both effectively hidden forever',
      rules: [
        { afterComplete: { questions: { hidden: true } } },
        { labels: ['A'], afterComplete: { score: { hidden: true } } },
      ],
      issues: [],
    },
    {
      label: 'override-score hidden forever conflicts with inherited questions reveal date',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
          },
        },
        { labels: ['A'], afterComplete: { score: { hidden: true } } },
      ],
      issues: [
        {
          ruleIndex: 1,
          message:
            /Questions cannot become visible after completion while the score remains hidden/,
        },
      ],
    },
    {
      label: 'override that does not touch afterComplete inherits a conflict on both rules',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-15T00:00:00' },
          },
        },
        { labels: ['A'] },
      ],
      issues: [
        {
          ruleIndex: 0,
          message: /score must become visible on or before the question reveal date/,
        },
        {
          ruleIndex: 1,
          message: /score must become visible on or before the question reveal date/,
        },
      ],
    },
    {
      label: 'multiple overrides report independently',
      rules: [
        {
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-04-10T00:00:00' },
          },
        },
        {
          labels: ['A'],
          afterComplete: { score: { hidden: true, visibleFromDate: '2024-04-15T00:00:00' } },
        },
        {
          labels: ['B'],
          afterComplete: { score: { hidden: true, visibleFromDate: '2024-04-08T00:00:00' } },
        },
        {
          labels: ['C'],
          afterComplete: { questions: { hidden: true, visibleFromDate: '2024-04-05T00:00:00' } },
        },
      ],
      issues: [
        {
          ruleIndex: 1,
          message: /score must become visible on or before the question reveal date/,
        },
        {
          ruleIndex: 3,
          message: /score must become visible on or before the question reveal date/,
        },
      ],
    },
  ] satisfies { label: string; rules: AccessControlJsonInput[]; issues: ExpectedIssue[] }[])(
    '$label',
    ({ rules, issues: expectedIssues }) => {
      const actualIssues = validateAfterCompleteCrossFieldIssues(buildRules(rules));
      assert.lengthOf(actualIssues, expectedIssues.length);
      for (const expected of expectedIssues) {
        const issue = actualIssues.find((i) => i.ruleIndex === expected.ruleIndex);
        assert.isDefined(issue);
        assert.deepEqual(issue.path, ['afterComplete', 'questions']);
        assert.match(issue.message, expected.message);
      }
    },
  );
});

describe('Global afterComplete validation', () => {
  it('does not duplicate direct afterComplete cross-field errors', () => {
    const result = validateAccessControlRules({
      rules: [
        AccessControlJsonSchema.parse({
          dateControl: {
            release: { date: '2024-03-14T00:01:00' },
            due: { date: '2024-03-21T23:59:00' },
          },
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-03-25T00:00:00' },
            score: { hidden: true },
          },
        }),
      ],
    });

    const matches = result.errors.filter((e) =>
      e.includes('Questions cannot become visible after completion while the score remains hidden'),
    );
    assert.lengthOf(matches, 1);
  });

  it.each([
    {
      name: 'default rule with no dateControl',
      rules: [
        {
          afterComplete: { questions: { hidden: false } },
        },
      ],
    },
    {
      name: 'default rule with dateControl but no automatic completion mechanism',
      rules: [
        {
          dateControl: { release: { date: '2024-03-14T00:01:00' } },
          afterComplete: { questions: { hidden: true }, score: { hidden: true } },
        },
      ],
    },
    {
      name: 'override with no automatic completion mechanism',
      rules: [
        {},
        {
          uuid: '11111111-1111-4111-8111-111111111111',
          labels: ['Section A'],
          afterComplete: { questions: { hidden: true } },
        },
      ],
    },
    {
      name: 'override that clears inherited due date',
      rules: [
        {
          dateControl: {
            release: { date: '2024-03-14T00:01:00' },
            due: { date: '2024-03-21T23:59:00' },
          },
        },
        {
          uuid: '11111111-1111-4111-8111-111111111111',
          labels: ['Section A'],
          dateControl: { due: { date: null } },
          afterComplete: { questions: { hidden: true } },
        },
      ],
    },
  ] satisfies { name: string; rules: AccessControlJsonInput[] }[])(
    'accepts afterComplete on $name',
    ({ rules }) => {
      const result = validateAccessControlRules({
        rules: rules.map((rule) => AccessControlJsonSchema.parse(rule)),
      });

      assert.deepEqual(result.errors, []);
    },
  );
});
