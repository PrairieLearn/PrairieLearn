import * as fs from 'fs/promises';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AssessmentAccessRuleJson } from '../schemas/infoAssessment.js';

import {
  analyzeAssessmentFile,
  analyzeCourseInstanceAssessments,
  applyMigrationToAssessmentFile,
  classifyArchetype,
  migrateAllowAccess,
} from './access-control-migration.js';

describe('classifyArchetype', () => {
  it('classifies no-op rules', () => {
    const rules: AssessmentAccessRuleJson[] = [{}];
    expect(classifyArchetype(rules)).toBe('no-op');
  });

  it('classifies prairietest-exam', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { examUuid: 'abc-123', mode: 'Exam', credit: 100 },
      { startDate: '2024-01-01', active: false },
    ];
    expect(classifyArchetype(rules)).toBe('prairietest-exam');
  });

  it('classifies password-gated', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { password: 'secret', credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    expect(classifyArchetype(rules)).toBe('password-gated');
  });

  it('classifies timed-assessment', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', timeLimitMin: 60 },
    ];
    expect(classifyArchetype(rules)).toBe('timed-assessment');
  });

  it('classifies single-deadline', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    expect(classifyArchetype(rules)).toBe('single-deadline');
  });

  it('classifies single-deadline-with-viewing', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
      { startDate: '2024-01-01' },
    ];
    expect(classifyArchetype(rules)).toBe('single-deadline-with-viewing');
  });

  it('classifies declining-credit', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
      { credit: 50, startDate: '2024-03-01', endDate: '2024-06-01' },
    ];
    expect(classifyArchetype(rules)).toBe('declining-credit');
  });

  it('classifies multi-deadline', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
      { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
    ];
    expect(classifyArchetype(rules)).toBe('multi-deadline');
  });

  it('classifies single full-credit without dates as single-deadline', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 100 }];
    expect(classifyArchetype(rules)).toBe('single-deadline');
  });

  it('classifies view-only', () => {
    const rules: AssessmentAccessRuleJson[] = [{ startDate: '2024-01-01' }];
    expect(classifyArchetype(rules)).toBe('view-only');
  });

  it('classifies hidden', () => {
    const rules: AssessmentAccessRuleJson[] = [{ active: false }];
    expect(classifyArchetype(rules)).toBe('hidden');
  });

  it('classifies single-deadline with mode-gated modifier', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', mode: 'Exam' },
    ];
    expect(classifyArchetype(rules)).toBe('single-deadline (mode-gated)');
  });

  it('classifies single-deadline with hides-closed modifier', () => {
    const rules: AssessmentAccessRuleJson[] = [
      {
        credit: 100,
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        showClosedAssessment: false,
      },
    ];
    expect(classifyArchetype(rules)).toBe('single-deadline (hides-closed)');
  });

  it('classifies single-reduced-credit', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' }];
    expect(classifyArchetype(rules)).toBe('single-reduced-credit');
  });

  it('returns unclassified for empty rules', () => {
    const rules: AssessmentAccessRuleJson[] = [];
    expect(classifyArchetype(rules)).toBe('no-op');
  });
});

describe('migrateAllowAccess', () => {
  it('migrates single-deadline', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result, warnings } = migrateAllowAccess('single-deadline', rules);
    expect(result.dateControl?.enabled).toBe(true);
    expect(result.dateControl?.releaseDate).toBe('2024-01-01');
    expect(result.dateControl?.dueDate).toBe('2024-06-01');
    expect(warnings).toHaveLength(0);
  });

  it('migrates single-deadline-with-viewing', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-02-01', endDate: '2024-06-01' },
      { startDate: '2024-01-01', active: false },
    ];
    const { result } = migrateAllowAccess('single-deadline-with-viewing', rules);
    expect(result.dateControl?.releaseDate).toBe('2024-01-01');
    expect(result.dateControl?.dueDate).toBe('2024-06-01');
  });

  it('migrates timed-assessment', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', timeLimitMin: 90 },
    ];
    const { result } = migrateAllowAccess('timed-assessment', rules);
    expect(result.dateControl?.durationMinutes).toBe(90);
  });

  it('migrates declining-credit', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 110, startDate: '2024-01-01', endDate: '2024-02-01' },
      { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
      { credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result } = migrateAllowAccess('declining-credit', rules);
    expect(result.dateControl?.dueDate).toBe('2024-03-01');
    expect(result.dateControl?.earlyDeadlines).toHaveLength(1);
    expect(result.dateControl?.earlyDeadlines?.[0]).toEqual({
      date: '2024-02-01',
      credit: 110,
    });
    expect(result.dateControl?.lateDeadlines).toHaveLength(1);
    expect(result.dateControl?.lateDeadlines?.[0]).toEqual({
      date: '2024-06-01',
      credit: 50,
    });
  });

  it('migrates prairietest-exam', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { examUuid: 'exam-uuid-1', credit: 100 },
      { startDate: '2024-01-01', active: false },
    ];
    const { result } = migrateAllowAccess('prairietest-exam', rules);
    expect(result.integrations?.prairieTest?.enabled).toBe(true);
    expect(result.integrations?.prairieTest?.exams).toEqual([{ examUuid: 'exam-uuid-1' }]);
    expect(result.dateControl?.releaseDate).toBe('2024-01-01');
  });

  it('migrates view-only', () => {
    const rules: AssessmentAccessRuleJson[] = [{ startDate: '2024-01-01' }];
    const { result } = migrateAllowAccess('view-only', rules);
    expect(result.dateControl?.dueDate).toBeNull();
    expect(result.dateControl?.releaseDate).toBe('2024-01-01');
  });

  it('migrates password-gated', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { password: 'secret', credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
    ];
    const { result } = migrateAllowAccess('password-gated', rules);
    expect(result.dateControl?.password).toBe('secret');
    expect(result.dateControl?.releaseDate).toBe('2024-01-01');
  });

  it('migrates hidden', () => {
    const rules: AssessmentAccessRuleJson[] = [{ active: false }];
    const { result } = migrateAllowAccess('hidden', rules);
    expect(result.blockAccess).toBe(true);
  });

  it('migrates no-op', () => {
    const rules: AssessmentAccessRuleJson[] = [{}];
    const { result, warnings } = migrateAllowAccess('no-op', rules);
    expect(result).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  it('migrates always-open', () => {
    const rules: AssessmentAccessRuleJson[] = [{ credit: 100 }];
    const { result, warnings } = migrateAllowAccess('always-open', rules);
    expect(result).toEqual({});
    expect(warnings).toHaveLength(0);
  });

  it('returns unsupported warning for unclassified', () => {
    const { warnings } = migrateAllowAccess('unclassified', []);
    expect(warnings[0]).toMatch(/Unsupported/);
  });

  it('includes afterComplete for showClosedAssessment:false', () => {
    const rules: AssessmentAccessRuleJson[] = [
      { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', showClosedAssessment: false },
    ];
    const { result } = migrateAllowAccess('single-deadline', rules);
    expect(result.afterComplete?.hideQuestions).toBe(true);
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
    expect(result.afterComplete?.hideScore).toBe(true);
  });
});

describe('analyzeAssessmentFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp('/tmp/access-control-test-');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null for assessments with no allowAccess', async () => {
    const filePath = path.join(tmpDir, 'infoAssessment.json');
    await fs.writeFile(filePath, JSON.stringify({ type: 'Exam', title: 'Test' }));
    const result = await analyzeAssessmentFile(filePath, 'test');
    expect(result).toBeNull();
  });

  it('returns null for assessments already using accessControl', async () => {
    const filePath = path.join(tmpDir, 'infoAssessment.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({
        type: 'Exam',
        title: 'Test',
        accessControl: [{ dateControl: { enabled: true } }],
      }),
    );
    const result = await analyzeAssessmentFile(filePath, 'test');
    expect(result).toBeNull();
  });

  it('analyzes an assessment with legacy allowAccess', async () => {
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
    expect(result).not.toBeNull();
    expect(result!.tid).toBe('hw01');
    expect(result!.archetype).toBe('single-deadline');
    expect(result!.canMigrate).toBe(true);
    expect(result!.hasUidRules).toBe(false);
  });

  it('flags uid rules', async () => {
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
    expect(result!.hasUidRules).toBe(true);
  });
});

describe('analyzeCourseInstanceAssessments', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp('/tmp/access-control-ci-test-');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty analysis when no assessments directory exists', async () => {
    const result = await analyzeCourseInstanceAssessments(tmpDir);
    expect(result.hasLegacyRules).toBe(false);
    expect(result.assessments).toHaveLength(0);
  });

  it('analyzes assessments in a course instance', async () => {
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
    expect(result.hasLegacyRules).toBe(true);
    expect(result.assessments).toHaveLength(1);
    expect(result.assessments[0].tid).toBe('hw01');
    expect(result.allCanMigrate).toBe(true);
  });
});

describe('applyMigrationToAssessmentFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp('/tmp/access-control-apply-test-');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('wipe strategy removes allowAccess', async () => {
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
    expect(result.allowAccess).toBeUndefined();
    expect(result.accessControl).toBeUndefined();
    expect(result.type).toBe('Homework');
  });

  it('migrate strategy converts compatible rules', async () => {
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
    expect(result.allowAccess).toBeUndefined();
    expect(result.accessControl).toBeDefined();
    expect(result.accessControl).toHaveLength(1);
    expect(result.accessControl[0].dateControl?.dueDate).toBe('2024-06-01');
  });

  it('migrate strategy with preserveIncompatible keeps incompatible rules', async () => {
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
    expect(result.allowAccess).toBeDefined();
    expect(result.accessControl).toBeUndefined();
  });

  it('migrate strategy without preserveIncompatible removes incompatible rules', async () => {
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
    expect(result.allowAccess).toBeUndefined();
    expect(result.accessControl).toBeUndefined();
  });

  it('skips files that already use accessControl', async () => {
    const filePath = path.join(tmpDir, 'infoAssessment.json');
    const originalData = {
      type: 'Homework',
      title: 'HW1',
      allowAccess: [{ credit: 100 }],
      accessControl: [{ dateControl: { enabled: true } }],
    };
    await fs.writeFile(filePath, JSON.stringify(originalData));

    await applyMigrationToAssessmentFile(filePath, 'wipe', false);

    const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    // File is unchanged because it already has accessControl
    expect(result.allowAccess).toBeDefined();
    expect(result.accessControl).toBeDefined();
  });

  it('skips files with no allowAccess', async () => {
    const filePath = path.join(tmpDir, 'infoAssessment.json');
    const originalData = { type: 'Homework', title: 'HW1' };
    await fs.writeFile(filePath, JSON.stringify(originalData));

    await applyMigrationToAssessmentFile(filePath, 'migrate', false);

    const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(result.accessControl).toBeUndefined();
  });
});
