import * as fs from 'fs/promises';
import * as path from 'path';

import tmp from 'tmp-promise';
import { assert, describe, it } from 'vitest';

import type { AssessmentAccessRuleJson } from '../../schemas/infoAssessment.js';

import {
  analyzeAssessmentFile,
  analyzeCourseInstanceAssessments,
  applyMigrationToAssessmentFile,
  classifyArchetype,
  migrateAllowAccess,
  migrateAssessmentJson,
} from './migration.js';
import { validateRule } from './validation.js';

describe('classifyArchetype', () => {
  const archetype = (base: string, modifiers: string[] = []) => ({ base, modifiers });

  const cases: {
    name: string;
    rules: AssessmentAccessRuleJson[];
    expected: { base: string; modifiers: string[] };
  }[] = [
    { name: 'empty rules', rules: [], expected: archetype('no-op') },
    { name: 'no-op rules', rules: [{}], expected: archetype('no-op') },
    {
      name: 'prairietest-exam',
      rules: [
        { examUuid: 'abc-123', mode: 'Exam', credit: 100 },
        { startDate: '2024-01-01', active: false },
      ],
      expected: archetype('prairietest-exam'),
    },
    {
      name: 'password-gated',
      rules: [{ password: 'secret', credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: archetype('password-gated'),
    },
    {
      name: 'timed-assessment',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', timeLimitMin: 60 }],
      expected: archetype('timed-assessment'),
    },
    {
      name: 'single-deadline',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: archetype('single-deadline'),
    },
    {
      name: 'single-deadline-with-viewing',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
        { startDate: '2024-01-01', active: false },
      ],
      expected: archetype('single-deadline-with-viewing'),
    },
    {
      name: 'declining-credit',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 50, startDate: '2024-03-01', endDate: '2024-06-01' },
      ],
      expected: archetype('declining-credit'),
    },
    {
      name: 'multi-deadline (contiguous)',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
      ],
      expected: archetype('multi-deadline'),
    },
    {
      name: 'multi-deadline with gap (unsupported)',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
        { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
      ],
      expected: archetype('unclassified'),
    },
    {
      name: 'half-open gap (endDate then startDate with gap)',
      rules: [
        { credit: 100, endDate: '2024-02-01' },
        { credit: 100, startDate: '2024-03-01' },
      ],
      expected: archetype('unclassified'),
    },
    {
      name: 'half-open contiguous (endDate meets startDate)',
      rules: [
        { credit: 100, endDate: '2024-02-01' },
        { credit: 100, startDate: '2024-02-01' },
      ],
      expected: archetype('multi-deadline'),
    },
    {
      name: 'single full-credit without dates',
      rules: [{ credit: 100 }],
      expected: archetype('single-deadline'),
    },
    {
      name: 'view-only',
      rules: [{ startDate: '2024-01-01', active: false }],
      expected: archetype('view-only'),
    },
    { name: 'hidden', rules: [{ active: false }], expected: archetype('hidden') },
    {
      name: 'single-deadline with mode-gated',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', mode: 'Exam' }],
      expected: archetype('single-deadline', ['mode-gated']),
    },
    {
      name: 'single-deadline with hides-closed',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          showClosedAssessment: false,
        },
      ],
      expected: archetype('single-deadline', ['hides-closed']),
    },
    {
      name: 'single-reduced-credit',
      rules: [{ credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: archetype('single-reduced-credit'),
    },
    {
      name: 'ignores UID rules, classifies remainder',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
        { uids: ['user@example.com'], credit: 100, endDate: '2024-07-01' },
      ],
      expected: archetype('single-deadline'),
    },
    {
      name: 'all-UID rules',
      rules: [{ uids: ['user@example.com'], credit: 100, endDate: '2024-06-01' }],
      expected: archetype('no-op'),
    },
    {
      name: 'UID rules mixed with declining-credit',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 50, startDate: '2024-03-01', endDate: '2024-06-01' },
        { uids: ['user@example.com'], credit: 100 },
      ],
      expected: archetype('declining-credit'),
    },
    { name: 'mode-only rule', rules: [{ mode: 'Exam' }], expected: archetype('mode-gated') },
    {
      name: 'combined mode-gated and hides-closed',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          mode: 'Exam',
          showClosedAssessment: false,
        },
      ],
      expected: archetype('single-deadline', ['mode-gated', 'hides-closed']),
    },
    {
      name: 'hides-score modifier',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          showClosedAssessmentScore: false,
        },
      ],
      expected: archetype('single-deadline', ['hides-score']),
    },
    {
      name: 'declining-credit with bonus and reduced',
      rules: [
        { credit: 120, startDate: '2024-01-01', endDate: '2024-02-01' },
        { credit: 50, startDate: '2024-02-01', endDate: '2024-06-01' },
      ],
      expected: archetype('declining-credit'),
    },
    {
      name: 'timed-assessment with mode-gated',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          timeLimitMin: 60,
          mode: 'Exam',
        },
      ],
      expected: archetype('timed-assessment', ['mode-gated']),
    },
    {
      name: 'single bonus credit',
      rules: [{ credit: 120, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: archetype('single-deadline'),
    },
  ];

  it.each(cases)('classifies $name as $expected', ({ rules, expected }) => {
    assert.deepEqual(classifyArchetype(rules), expected);
  });
});

describe('migrateAllowAccess', () => {
  it('migrates single-deadline', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result, errors, notes } = migrateAllowAccess({ base: 'single-deadline', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
    assert.lengthOf(errors, 0);
    assert.lengthOf(notes, 0);
  });

  it('migrates single-deadline-with-viewing', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-02-01', endDate: '2024-06-01' },
      { startDate: '2024-01-01', active: false },
    ];
    const { result } = migrateAllowAccess({ base: 'single-deadline-with-viewing', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
  });

  it('migrates timed-assessment', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', timeLimitMin: 90 },
    ];
    const { result } = migrateAllowAccess({ base: 'timed-assessment', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01', durationMinutes: 90 },
    });
  });

  it('migrates declining-credit', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 110, startDate: '2024-01-01', endDate: '2024-02-01' },
      { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
      { credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result } = migrateAllowAccess({ base: 'declining-credit', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: {
        releaseDate: '2024-01-01',
        dueDate: '2024-03-01',
        earlyDeadlines: [{ date: '2024-02-01', credit: 110 }],
        lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
      },
    });
  });

  it('migrates prairietest-exam', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { examUuid: 'exam-uuid-1', credit: 100 },
      { startDate: '2024-01-01', active: false },
    ];
    const { result } = migrateAllowAccess({ base: 'prairietest-exam', modifiers: [] }, rules);
    assert.deepEqual(result, {
      integrations: { prairieTest: { exams: [{ examUuid: 'exam-uuid-1' }] } },
      dateControl: { releaseDate: '2024-01-01', dueDate: null },
    });
  });

  it('migrates view-only', () => {
    const rules: AssessmentAccessRuleJson[] = [{ startDate: '2024-01-01' }];
    const { result } = migrateAllowAccess({ base: 'view-only', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: null },
    });
  });

  it('migrates password-gated', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { password: 'secret', credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result } = migrateAllowAccess({ base: 'password-gated', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { password: 'secret', releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
  });

  it('migrates hidden', () => {
    const rules: AssessmentAccessRuleJson[] = [{ active: false }];
    const { result } = migrateAllowAccess({ base: 'hidden', modifiers: [] }, rules);
    assert.deepEqual(result, {});
  });

  it('migrates no-op', () => {
    const rules: AssessmentAccessRuleJson[] = [{}];
    const { result, errors, notes } = migrateAllowAccess({ base: 'no-op', modifiers: [] }, rules);
    assert.deepEqual(result, {});
    assert.lengthOf(errors, 0);
    assert.lengthOf(notes, 1);
  });

  it('migrates always-open', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 100 }];
    const { result, errors, notes } = migrateAllowAccess({ base: 'always-open', modifiers: [] }, rules);
    assert.deepEqual(result, {});
    assert.lengthOf(errors, 0);
    assert.lengthOf(notes, 0);
  });

  it('returns a user-facing error for unclassified', () => {
    const { errors } = migrateAllowAccess({ base: 'unclassified', modifiers: [] }, []);
    assert.equal(errors[0], 'This access rule configuration is not supported.');
  });

  it('includes afterComplete for showClosedAssessment:false', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', showClosedAssessment: false },
    ];
    const { result } = migrateAllowAccess({ base: 'single-deadline', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
      afterComplete: { hideQuestions: true },
    });
  });

  it('includes afterComplete for showClosedAssessmentScore:false', () => {
    const rules: AssessmentAccessRuleJson[] = [
      {
        credit: 100,
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        showClosedAssessmentScore: false,
      },
    ];
    const { result } = migrateAllowAccess({ base: 'single-deadline', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
      afterComplete: { hideScore: true },
    });
  });

  it('migrates active access restriction exams with pre-release listing and later reveal', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { endDate: '2030-01-01T00:00:00', active: false },
      {
        credit: 100,
        timeLimitMin: 50,
        startDate: '2030-01-01T00:00:01',
        endDate: '2030-01-01T23:59:59',
        showClosedAssessment: false,
      },
      { active: false, startDate: '2030-01-04T00:00:01' },
    ];
    const { result } = migrateAllowAccess({ base: 'timed-assessment', modifiers: ['hides-closed'] }, rules);
    assert.deepEqual(result, {
      listBeforeRelease: true,
      dateControl: {
        releaseDate: '2030-01-01T00:00:01',
        dueDate: '2030-01-01T23:59:59',
        durationMinutes: 50,
      },
      afterComplete: {
        hideQuestions: true,
        showQuestionsAgainDate: '2030-01-04T00:00:01',
      },
    });
    assert.deepEqual(validateRule(result, 'none'), []);
  });

  it('ignores UID rules during migration', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
      { uids: ['user@example.com'], credit: 100, endDate: '2024-12-01' },
    ];
    const { result } = migrateAllowAccess({ base: 'single-deadline', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
  });

  it('multi-deadline produces collapse note', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
      { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
    ];
    const { errors, notes } = migrateAllowAccess({ base: 'multi-deadline', modifiers: [] }, rules);
    assert.lengthOf(errors, 0);
    assert.match(notes[0], /collapsed/);
  });

  it('declining-credit with bonus and reduced (no full) omits dueDate', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 120, startDate: '2024-01-01', endDate: '2024-02-01' },
      { credit: 50, startDate: '2024-02-01', endDate: '2024-06-01' },
    ];
    const { result, errors, notes } = migrateAllowAccess({ base: 'declining-credit', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: {
        releaseDate: '2024-01-01',
        earlyDeadlines: [{ date: '2024-02-01', credit: 120 }],
        lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
      },
    });
    assert.lengthOf(errors, 0);
    assert.lengthOf(notes, 0);
  });

  it('declining-credit with multiple bonus and reduced (no full) omits dueDate', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 130, startDate: '2024-01-01', endDate: '2024-01-15' },
      { credit: 120, startDate: '2024-01-01', endDate: '2024-02-01' },
      { credit: 50, startDate: '2024-02-01', endDate: '2024-06-01' },
    ];
    const { result, errors, notes } = migrateAllowAccess({ base: 'declining-credit', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: {
        releaseDate: '2024-01-01',
        earlyDeadlines: [
          { date: '2024-01-15', credit: 130 },
          { date: '2024-02-01', credit: 120 },
        ],
        lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
      },
    });
    assert.lengthOf(errors, 0);
    assert.lengthOf(notes, 0);
  });

  it('collapses dominated late deadlines so migrated credit stays monotonic', () => {
    // Reduced rules intentionally out of chronological order relative to credit:
    // later date has higher credit, earlier date has lower credit.
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
      { credit: 80, startDate: '2024-01-01', endDate: '2024-06-01' },
      { credit: 30, startDate: '2024-01-01', endDate: '2024-04-01' },
    ];
    const { result, errors, notes } = migrateAllowAccess({ base: 'declining-credit', modifiers: [] }, rules);
    assert.deepEqual(result.dateControl?.lateDeadlines, [{ date: '2024-06-01', credit: 80 }]);
    assert.lengthOf(errors, 0);
    assert.match(notes[0], /collapsed/);
    assert.deepEqual(validateRule(result, 'none'), []);
  });

  it('migrates single-reduced-credit as late deadline without dueDate', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result, errors, notes } = migrateAllowAccess({ base: 'single-reduced-credit', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: {
        releaseDate: '2024-01-01',
        lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
      },
    });
    assert.lengthOf(errors, 0);
    assert.lengthOf(notes, 0);
  });

  it('migrates single bonus credit as early deadline without dueDate', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 120, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result, errors, notes } = migrateAllowAccess({ base: 'single-deadline', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: {
        releaseDate: '2024-01-01',
        earlyDeadlines: [{ date: '2024-06-01', credit: 120 }],
      },
    });
    assert.lengthOf(errors, 0);
    assert.lengthOf(notes, 0);
  });

  it('migrates multiple prairietest exams', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { examUuid: 'exam-1', credit: 100 },
      { examUuid: 'exam-2', credit: 100 },
    ];
    const { result } = migrateAllowAccess({ base: 'prairietest-exam', modifiers: [] }, rules);
    assert.deepEqual(result, {
      integrations: {
        prairieTest: { exams: [{ examUuid: 'exam-1' }, { examUuid: 'exam-2' }] },
      },
    });
  });

  it('includes both hideQuestions and hideScore in afterComplete', () => {
    const rules: AssessmentAccessRuleJson[] = [
      {
        credit: 100,
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        showClosedAssessment: false,
        showClosedAssessmentScore: false,
      },
    ];
    const { result } = migrateAllowAccess({ base: 'single-deadline', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
      afterComplete: { hideQuestions: true, hideScore: true },
    });
  });

  it('handles modifier suffix stripping for mode-gated hides-closed', () => {
    const rules: AssessmentAccessRuleJson[] = [
      {
        credit: 100,
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        mode: 'Exam',
        showClosedAssessment: false,
      },
    ];
    const { result } = migrateAllowAccess({ base: 'single-deadline', modifiers: ['mode-gated', 'hides-closed'] }, rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
      afterComplete: { hideQuestions: true },
    });
  });

  it('password-gated without dates', () => {
    const rules: AssessmentAccessRuleJson[] = [{ password: 'secret', credit: 100 }];
    const { result } = migrateAllowAccess({ base: 'password-gated', modifiers: [] }, rules);
    assert.deepEqual(result, {
      dateControl: { password: 'secret' },
    });
  });

  it('no-op returns note with empty result', () => {
    const { result, notes } = migrateAllowAccess({ base: 'no-op', modifiers: [] }, [{}]);
    assert.match(notes[0], /empty accessControl/);
    assert.deepEqual(result, {});
  });

  it('declining-credit with no credit rules returns error', () => {
    const rules: AssessmentAccessRuleJson[] = [{ startDate: '2024-01-01' }];
    const { result, errors } = migrateAllowAccess({ base: 'declining-credit', modifiers: [] }, rules);
    assert.match(errors[0], /No credit rules found/);
    assert.deepEqual(result, {});
  });

  it('single-deadline with no credit rule returns error', () => {
    const rules: AssessmentAccessRuleJson[] = [{ startDate: '2024-01-01' }];
    const { result, errors } = migrateAllowAccess({ base: 'single-deadline', modifiers: [] }, rules);
    assert.match(errors[0], /No credit rule found/);
    assert.deepEqual(result, {});
  });

  it('prairietest-exam with no examUuid returns error', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 100 }];
    const { result, errors } = migrateAllowAccess({ base: 'prairietest-exam', modifiers: [] }, rules);
    assert.match(errors[0], /No examUuid rule found/);
    assert.deepEqual(result, {});
  });

  it('password-gated with no password returns error', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 100 }];
    const { result, errors } = migrateAllowAccess({ base: 'password-gated', modifiers: [] }, rules);
    assert.match(errors[0], /No password rule found/);
    assert.deepEqual(result, {});
  });
});

describe('analyzeAssessmentFile', () => {
  it('returns null for assessments with no allowAccess', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(filePath, JSON.stringify({ type: 'Exam', title: 'Test' }));
        const result = await analyzeAssessmentFile(filePath, 'test');
        assert.isNull(result);
      },
      { unsafeCleanup: true },
    );
  });

  it('returns null for assessments already using accessControl', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'Test',
            accessControl: [{ dateControl: { releaseDate: '2024-01-01' } }],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'test');
        assert.isNull(result);
      },
      { unsafeCleanup: true },
    );
  });

  it('analyzes an assessment with legacy allowAccess', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'hw01');
        assert.isNotNull(result);
        assert.equal(result.tid, 'hw01');
        assert.deepEqual(result.archetype, { base: 'single-deadline', modifiers: [] });
        assert.equal(result.errors.length, 0);
        assert.equal(result.hasUidRules, false);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.notes, []);
      },
      { unsafeCleanup: true },
    );
  });

  it('flags uid rules', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [
              { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
              { uids: ['user@example.com'], credit: 100, endDate: '2024-07-01' },
            ],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'e01');
        assert.isNotNull(result);
        assert.equal(result.errors.length, 0);
        assert.equal(result.hasUidRules, true);
        assert(result.notes.some((note) => note.includes('UID-based rules are excluded')));
      },
      { unsafeCleanup: true },
    );
  });

  it('classifies from non-UID rules when mixed with UID rules', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [
              { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
              { credit: 50, startDate: '2024-03-01', endDate: '2024-06-01' },
              { uids: ['user@example.com'], credit: 100, endDate: '2024-07-01' },
            ],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'e01');
        assert.isNotNull(result);
        assert.deepEqual(result.archetype, { base: 'declining-credit', modifiers: [] });
        assert.equal(result.hasUidRules, true);
        assert.equal(result.errors.length, 0);
        assert(result.notes.some((note) => note.includes('UID-based rules are excluded')));
      },
      { unsafeCleanup: true },
    );
  });

  it('all-UID rules produces unclassified with errors', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [{ uids: ['user@example.com'], credit: 100 }],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'e01');
        assert.isNotNull(result);
        assert.deepEqual(result.archetype, { base: 'unclassified', modifiers: [] });
        assert.isAbove(result.errors.length, 0);
        assert.equal(result.hasUidRules, true);
        assert(result.errors.some((error) => error.includes('not supported')));
        assert(result.notes.some((note) => note.includes('UID-based rules are excluded')));
      },
      { unsafeCleanup: true },
    );
  });

  it('reports a specific error for non-contiguous access windows', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW gap',
            allowAccess: [
              { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
              { credit: 50, startDate: '2024-03-01', endDate: '2024-04-01' },
            ],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'hw-gap');
        assert.isNotNull(result);
        assert.deepEqual(result.archetype, { base: 'unclassified', modifiers: [] });
        assert.isAbove(result.errors.length, 0);
        assert.deepEqual(result.errors, ['Non-contiguous access windows are not supported.']);
        assert.deepEqual(result.notes, []);
      },
      { unsafeCleanup: true },
    );
  });

  it('returns null for empty allowAccess array', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'e01');
        assert.isNull(result);
      },
      { unsafeCleanup: true },
    );
  });

  it('returns null for invalid JSON file', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(filePath, 'not valid json {{{');
        const result = await analyzeAssessmentFile(filePath, 'e01');
        assert.isNull(result);
      },
      { unsafeCleanup: true },
    );
  });

  it('no-op rule is technically migratable', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [{}],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'hw01');
        assert.isNotNull(result);
        assert.deepEqual(result.archetype, { base: 'no-op', modifiers: [] });
        assert.equal(result.errors.length, 0);
        assert.match(result.notes[0], /empty accessControl/);
      },
      { unsafeCleanup: true },
    );
  });
});

describe('analyzeCourseInstanceAssessments', () => {
  it('returns empty analysis when no assessments directory exists', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const result = await analyzeCourseInstanceAssessments(tmpDir);
        assert.equal(result.hasLegacyRules, false);
        assert.lengthOf(result.assessments, 0);
      },
      { unsafeCleanup: true },
    );
  });

  it('analyzes assessments in a course instance', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const assessmentsDir = path.join(tmpDir, 'assessments');
        await fs.mkdir(path.join(assessmentsDir, 'hw01'), { recursive: true });
        await fs.mkdir(path.join(assessmentsDir, 'hw02'), { recursive: true });

        await fs.writeFile(
          path.join(assessmentsDir, 'hw01', 'infoAssessment.json'),
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
          }),
        );
        await fs.writeFile(
          path.join(assessmentsDir, 'hw02', 'infoAssessment.json'),
          JSON.stringify({
            type: 'Homework',
            title: 'HW2',
          }),
        );

        const result = await analyzeCourseInstanceAssessments(tmpDir);
        assert.equal(result.hasLegacyRules, true);
        assert.lengthOf(result.assessments, 1);
        assert.equal(result.assessments[0].tid, 'hw01');
        assert.isTrue(result.assessments.every((a) => a.errors.length === 0));
      },
      { unsafeCleanup: true },
    );
  });
});

describe('applyMigrationToAssessmentFile', () => {
  it('keep strategy leaves file unchanged', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        const originalData = {
          type: 'Homework',
          title: 'HW1',
          allowAccess: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
        };
        await fs.writeFile(filePath, JSON.stringify(originalData));

        await applyMigrationToAssessmentFile(filePath, 'keep', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.deepEqual(result, originalData);
      },
      { unsafeCleanup: true },
    );
  });

  it('wipe strategy removes allowAccess', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'wipe', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.isUndefined(result.accessControl);
        assert.equal(result.type, 'Homework');
      },
      { unsafeCleanup: true },
    );
  });

  it('migrate strategy converts compatible rules', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.isDefined(result.accessControl);
        assert.lengthOf(result.accessControl, 1);
        assert.equal(result.accessControl[0].dateControl?.dueDate, '2024-06-01');
      },
      { unsafeCleanup: true },
    );
  });

  it('migrate strategy with preserveIncompatible keeps incompatible rules', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            // uid-only rules are filtered out for classification, leaving an empty set -> unclassified
            allowAccess: [{ uids: ['user@example.com'], credit: 100 }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', true);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        // preserveIncompatible: true means the original allowAccess is kept
        assert.isDefined(result.allowAccess);
        assert.isUndefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('migrate strategy without preserveIncompatible removes incompatible rules', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [{ uids: ['user@example.com'], credit: 100 }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.isUndefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('skips files that already use accessControl', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        const originalData = {
          type: 'Homework',
          title: 'HW1',
          allowAccess: [{ credit: 100 }],
          accessControl: [{ dateControl: { releaseDate: '2024-01-01' } }],
        };
        await fs.writeFile(filePath, JSON.stringify(originalData));

        await applyMigrationToAssessmentFile(filePath, 'wipe', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        // File is unchanged because it already has accessControl
        assert.isDefined(result.allowAccess);
        assert.isDefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('skips files with no allowAccess', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        const originalData = { type: 'Homework', title: 'HW1' };
        await fs.writeFile(filePath, JSON.stringify(originalData));

        await applyMigrationToAssessmentFile(filePath, 'migrate', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('migrates non-UID rules when mixed with UID rules', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [
              { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
              { uids: ['user@example.com'], credit: 100, endDate: '2024-12-01' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.lengthOf(result.accessControl, 1);
        assert.equal(result.accessControl[0].dateControl?.dueDate, '2024-06-01');
      },
      { unsafeCleanup: true },
    );
  });

  it('declining-credit full pipeline', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [
              { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
              { credit: 50, startDate: '2024-03-01', endDate: '2024-06-01' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.lengthOf(result.accessControl, 1);
        assert.equal(result.accessControl[0].dateControl?.lateDeadlines?.length, 1);
      },
      { unsafeCleanup: true },
    );
  });

  it('wipe with UID-only rules removes allowAccess without accessControl', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [{ uids: ['user@example.com'], credit: 100 }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'wipe', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.isUndefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('all-UID rules with preserveIncompatible:true keeps allowAccess', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [{ uids: ['user@example.com'], credit: 100 }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', true);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isDefined(result.allowAccess);
        assert.isUndefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('all-UID rules with preserveIncompatible:false removes allowAccess', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [{ uids: ['user@example.com'], credit: 100 }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.isUndefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('no-op rules produce empty accessControl entry', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [{}],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.lengthOf(result.accessControl, 1);
        assert.deepEqual(result.accessControl[0], {});
      },
      { unsafeCleanup: true },
    );
  });

  it('uses fallback release date when migration produces dateControl without releaseDate', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [{ password: 'secret', credit: 100 }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, '2025-01-15T00:00:00');

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.lengthOf(result.accessControl, 1);
        assert.equal(result.accessControl[0].dateControl?.releaseDate, '2025-01-15T00:00:00');
        assert.equal(result.accessControl[0].dateControl?.password, 'secret');
      },
      { unsafeCleanup: true },
    );
  });

  it('does not override existing release date with fallback', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, '2025-09-01T00:00:00');

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.equal(result.accessControl[0].dateControl?.releaseDate, '2024-01-01');
      },
      { unsafeCleanup: true },
    );
  });
});

describe('migrateAssessmentJson fallback release date', () => {
  it('uses fallback when migration produces dateControl without releaseDate', () => {
    const json = JSON.stringify({
      type: 'Homework',
      allowAccess: [{ password: 'secret', credit: 100 }],
    });
    const result = migrateAssessmentJson(json, '2025-01-15T00:00:00');
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.equal(parsed.accessControl[0].dateControl?.releaseDate, '2025-01-15T00:00:00');
  });

  it('does not override existing release date with fallback', () => {
    const json = JSON.stringify({
      type: 'Homework',
      allowAccess: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
    });
    const result = migrateAssessmentJson(json, '2025-09-01T00:00:00');
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.equal(parsed.accessControl[0].dateControl?.releaseDate, '2024-01-01');
  });

  it('does not add releaseDate when result has no dateControl', () => {
    const json = JSON.stringify({
      type: 'Homework',
      allowAccess: [{}],
    });
    const result = migrateAssessmentJson(json, '2025-01-15T00:00:00');
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.isUndefined(parsed.accessControl[0].dateControl);
  });

  it('works without fallback (backward compatible)', () => {
    const json = JSON.stringify({
      type: 'Homework',
      allowAccess: [{ password: 'secret', credit: 100 }],
    });
    const result = migrateAssessmentJson(json);
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.isUndefined(parsed.accessControl[0].dateControl?.releaseDate);
  });

  it('preserves active access restriction semantics during migration', () => {
    const json = JSON.stringify({
      type: 'Exam',
      allowAccess: [
        {
          endDate: '2030-01-01T00:00:00',
          active: false,
        },
        {
          credit: 100,
          timeLimitMin: 50,
          startDate: '2030-01-01T00:00:01',
          endDate: '2030-01-01T23:59:59',
          showClosedAssessment: false,
        },
        {
          active: false,
          startDate: '2030-01-04T00:00:01',
        },
      ],
    });
    const result = migrateAssessmentJson(json);
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.deepEqual(parsed.accessControl, [
      {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: '2030-01-01T00:00:01',
          dueDate: '2030-01-01T23:59:59',
          durationMinutes: 50,
        },
        afterComplete: {
          hideQuestions: true,
          showQuestionsAgainDate: '2030-01-04T00:00:01',
        },
      },
    ]);
  });
});
