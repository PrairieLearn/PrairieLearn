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
} from './migration.js';

describe('classifyArchetype', () => {
  const cases: { name: string; rules: AssessmentAccessRuleJson[]; expected: string }[] = [
    { name: 'empty rules', rules: [], expected: 'no-op' },
    { name: 'no-op rules', rules: [{}], expected: 'no-op' },
    {
      name: 'prairietest-exam',
      rules: [
        { examUuid: 'abc-123', mode: 'Exam', credit: 100 },
        { startDate: '2024-01-01', active: false },
      ],
      expected: 'prairietest-exam',
    },
    {
      name: 'password-gated',
      rules: [{ password: 'secret', credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: 'password-gated',
    },
    {
      name: 'timed-assessment',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', timeLimitMin: 60 }],
      expected: 'timed-assessment',
    },
    {
      name: 'single-deadline',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: 'single-deadline',
    },
    {
      name: 'single-deadline-with-viewing',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
        { startDate: '2024-01-01', active: false },
      ],
      expected: 'single-deadline-with-viewing',
    },
    {
      name: 'declining-credit',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 50, startDate: '2024-03-01', endDate: '2024-06-01' },
      ],
      expected: 'declining-credit',
    },
    {
      name: 'multi-deadline',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
        { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
      ],
      expected: 'multi-deadline',
    },
    {
      name: 'single full-credit without dates',
      rules: [{ credit: 100 }],
      expected: 'single-deadline',
    },
    {
      name: 'view-only',
      rules: [{ startDate: '2024-01-01', active: false }],
      expected: 'view-only',
    },
    { name: 'hidden', rules: [{ active: false }], expected: 'hidden' },
    {
      name: 'single-deadline with mode-gated',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', mode: 'Exam' }],
      expected: 'single-deadline (mode-gated)',
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
      expected: 'single-deadline (hides-closed)',
    },
    {
      name: 'single-reduced-credit',
      rules: [{ credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: 'single-reduced-credit',
    },
    {
      name: 'ignores UID rules, classifies remainder',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
        { uids: ['user@example.com'], credit: 100, endDate: '2024-07-01' },
      ],
      expected: 'single-deadline',
    },
    {
      name: 'all-UID rules',
      rules: [{ uids: ['user@example.com'], credit: 100, endDate: '2024-06-01' }],
      expected: 'no-op',
    },
    {
      name: 'UID rules mixed with declining-credit',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 50, startDate: '2024-03-01', endDate: '2024-06-01' },
        { uids: ['user@example.com'], credit: 100 },
      ],
      expected: 'declining-credit',
    },
    { name: 'mode-only rule', rules: [{ mode: 'Exam' }], expected: 'mode-gated' },
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
      expected: 'single-deadline (mode-gated, hides-closed)',
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
      expected: 'single-deadline (hides-score)',
    },
    {
      name: 'declining-credit with bonus and reduced',
      rules: [
        { credit: 120, startDate: '2024-01-01', endDate: '2024-02-01' },
        { credit: 50, startDate: '2024-02-01', endDate: '2024-06-01' },
      ],
      expected: 'declining-credit',
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
      expected: 'timed-assessment (mode-gated)',
    },
    {
      name: 'single bonus credit',
      rules: [{ credit: 120, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: 'single-deadline',
    },
  ];

  it.each(cases)('classifies $name as $expected', ({ rules, expected }) => {
    assert.equal(classifyArchetype(rules), expected);
  });
});

describe('migrateAllowAccess', () => {
  it('migrates single-deadline', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result, warnings } = migrateAllowAccess('single-deadline', rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
    assert.lengthOf(warnings, 0);
  });

  it('migrates single-deadline-with-viewing', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-02-01', endDate: '2024-06-01' },
      { startDate: '2024-01-01', active: false },
    ];
    const { result } = migrateAllowAccess('single-deadline-with-viewing', rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
  });

  it('migrates timed-assessment', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', timeLimitMin: 90 },
    ];
    const { result } = migrateAllowAccess('timed-assessment', rules);
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
    const { result } = migrateAllowAccess('declining-credit', rules);
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
    const { result } = migrateAllowAccess('prairietest-exam', rules);
    assert.deepEqual(result, {
      integrations: { prairieTest: { exams: [{ examUuid: 'exam-uuid-1' }] } },
      dateControl: { releaseDate: '2024-01-01', dueDate: null },
    });
  });

  it('migrates view-only', () => {
    const rules: AssessmentAccessRuleJson[] = [{ startDate: '2024-01-01' }];
    const { result } = migrateAllowAccess('view-only', rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: null },
    });
  });

  it('migrates password-gated', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { password: 'secret', credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result } = migrateAllowAccess('password-gated', rules);
    assert.deepEqual(result, {
      dateControl: { password: 'secret', releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
  });

  it('migrates hidden', () => {
    const rules: AssessmentAccessRuleJson[] = [{ active: false }];
    const { result } = migrateAllowAccess('hidden', rules);
    assert.deepEqual(result, {});
  });

  it('migrates no-op', () => {
    const rules: AssessmentAccessRuleJson[] = [{}];
    const { result, warnings } = migrateAllowAccess('no-op', rules);
    assert.deepEqual(result, {});
    assert.lengthOf(warnings, 1);
  });

  it('migrates always-open', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 100 }];
    const { result, warnings } = migrateAllowAccess('always-open', rules);
    assert.deepEqual(result, {});
    assert.lengthOf(warnings, 0);
  });

  it('returns unsupported warning for unclassified', () => {
    const { warnings } = migrateAllowAccess('unclassified', []);
    assert.match(warnings[0], /Unsupported/);
  });

  it('includes afterComplete for showClosedAssessment:false', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', showClosedAssessment: false },
    ];
    const { result } = migrateAllowAccess('single-deadline', rules);
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
    const { result } = migrateAllowAccess('single-deadline', rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
      afterComplete: { hideScore: true },
    });
  });

  it('ignores UID rules during migration', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
      { uids: ['user@example.com'], credit: 100, endDate: '2024-12-01' },
    ];
    const { result } = migrateAllowAccess('single-deadline', rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
  });

  it('multi-deadline produces collapse warning', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
      { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
    ];
    const { warnings } = migrateAllowAccess('multi-deadline', rules);
    assert.match(warnings[0], /collapsed/);
  });

  it('declining-credit with bonus and reduced (no full)', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 120, startDate: '2024-01-01', endDate: '2024-02-01' },
      { credit: 50, startDate: '2024-02-01', endDate: '2024-06-01' },
    ];
    const { result } = migrateAllowAccess('declining-credit', rules);
    assert.deepEqual(result, {
      dateControl: {
        releaseDate: '2024-01-01',
        dueDate: '2024-02-01',
        lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
      },
    });
  });

  it('migrates single-reduced-credit', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result } = migrateAllowAccess('single-reduced-credit', rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
    });
  });

  it('migrates multiple prairietest exams', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { examUuid: 'exam-1', credit: 100 },
      { examUuid: 'exam-2', credit: 100 },
    ];
    const { result } = migrateAllowAccess('prairietest-exam', rules);
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
    const { result } = migrateAllowAccess('single-deadline', rules);
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
    const { result } = migrateAllowAccess('single-deadline (mode-gated, hides-closed)', rules);
    assert.deepEqual(result, {
      dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
      afterComplete: { hideQuestions: true },
    });
  });

  it('password-gated without dates', () => {
    const rules: AssessmentAccessRuleJson[] = [{ password: 'secret', credit: 100 }];
    const { result } = migrateAllowAccess('password-gated', rules);
    assert.deepEqual(result, {
      dateControl: { password: 'secret' },
    });
  });

  it('returns unsupported warning for unknown archetype', () => {
    const { result, warnings } = migrateAllowAccess('some-future-thing', []);
    assert.match(warnings[0], /Unsupported/);
    assert.deepEqual(result, {});
  });

  it('no-op returns warning with empty result', () => {
    const { result, warnings } = migrateAllowAccess('no-op', [{}]);
    assert.match(warnings[0], /No-op/);
    assert.deepEqual(result, {});
  });

  it('declining-credit with no credit rules returns warning', () => {
    const rules: AssessmentAccessRuleJson[] = [{ startDate: '2024-01-01' }];
    const { result, warnings } = migrateAllowAccess('declining-credit', rules);
    assert.match(warnings[0], /No credit rules found/);
    assert.deepEqual(result, {});
  });

  it('single-deadline with no credit rule returns warning', () => {
    const rules: AssessmentAccessRuleJson[] = [{ startDate: '2024-01-01' }];
    const { result, warnings } = migrateAllowAccess('single-deadline', rules);
    assert.match(warnings[0], /No credit rule found/);
    assert.deepEqual(result, {});
  });

  it('prairietest-exam with no examUuid returns warning', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 100 }];
    const { result, warnings } = migrateAllowAccess('prairietest-exam', rules);
    assert.match(warnings[0], /No examUuid rule found/);
    assert.deepEqual(result, {});
  });

  it('password-gated with no password returns warning', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 100 }];
    const { result, warnings } = migrateAllowAccess('password-gated', rules);
    assert.match(warnings[0], /No password rule found/);
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
        assert.equal(result.archetype, 'single-deadline');
        assert.equal(result.canMigrate, true);
        assert.equal(result.hasUidRules, false);
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
        assert.equal(result.hasUidRules, true);
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
        assert.equal(result.archetype, 'declining-credit');
        assert.equal(result.hasUidRules, true);
        assert.equal(result.canMigrate, true);
      },
      { unsafeCleanup: true },
    );
  });

  it('all-UID rules produces unclassified and canMigrate=false', async () => {
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
        assert.equal(result.archetype, 'unclassified');
        assert.equal(result.canMigrate, false);
        assert.equal(result.hasUidRules, true);
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
        assert.equal(result.archetype, 'no-op');
        assert.equal(result.canMigrate, true);
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
        assert.equal(result.allCanMigrate, true);
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
});
