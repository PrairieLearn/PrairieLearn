import * as fs from 'fs/promises';
import * as path from 'path';

import tmp from 'tmp-promise';
import { assert, describe, it } from 'vitest';

import type { AssessmentAccessRuleJson } from '../../schemas/infoAssessment.js';

import {
  type MigrationResult,
  analyzeAssessmentFile,
  analyzeCourseInstanceAssessments,
  applyMigrationToAssessmentFile,
  migrateAllowAccess,
  migrateAssessmentJson,
} from './migration.js';
import { validateRule } from './validation.js';

describe('migrateAllowAccess', () => {
  const cases: {
    name: string;
    rules: AssessmentAccessRuleJson[];
    expected: MigrationResult;
  }[] = [
    {
      name: 'single-deadline',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: {
        archetype: { base: 'single-deadline', modifiers: [] },
        result: { dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' } },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'single-deadline-with-viewing',
      rules: [
        { credit: 100, startDate: '2024-02-01', endDate: '2024-06-01' },
        { startDate: '2024-01-01', active: false },
      ],
      expected: {
        archetype: { base: 'single-deadline-with-viewing', modifiers: [] },
        result: { dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' } },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'timed-assessment',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', timeLimitMin: 90 }],
      expected: {
        archetype: { base: 'timed-assessment', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2024-01-01',
            dueDate: '2024-06-01',
            durationMinutes: 90,
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'declining-credit',
      rules: [
        { credit: 110, startDate: '2024-01-01', endDate: '2024-02-01' },
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' },
      ],
      expected: {
        archetype: { base: 'declining-credit', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2024-01-01',
            dueDate: '2024-03-01',
            earlyDeadlines: [{ date: '2024-02-01', credit: 110 }],
            lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'prairietest with viewing rule',
      rules: [
        { examUuid: 'exam-uuid-1', credit: 100 },
        { startDate: '2024-01-01', active: false },
      ],
      expected: {
        archetype: { base: 'view-only', modifiers: ['prairietest'] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: null },
          integrations: { prairieTest: { exams: [{ examUuid: 'exam-uuid-1' }] } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'view-only',
      rules: [{ startDate: '2024-01-01', active: false }],
      expected: {
        archetype: { base: 'view-only', modifiers: [] },
        result: { dateControl: { releaseDate: '2024-01-01', dueDate: null } },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'password-gated',
      rules: [{ password: 'secret', credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: {
        archetype: { base: 'password-gated', modifiers: [] },
        result: {
          dateControl: { password: 'secret', releaseDate: '2024-01-01', dueDate: '2024-06-01' },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'hidden',
      rules: [{ active: false }],
      expected: {
        archetype: { base: 'hidden', modifiers: [] },
        result: {},
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'no-op',
      rules: [{}],
      expected: {
        archetype: { base: 'no-op', modifiers: [] },
        result: {},
        errors: [],
        notes: ['An empty accessControl list signifies that no access is granted.'],
        hasUidRules: false,
      },
    },
    // TODO: handle this case better.
    // {
    //   name: 'always-open',
    //   rules: [{ credit: 100 }],
    //   expected: {
    //     archetype: { base: 'always-open', modifiers: [] },
    //     result: { dateControl: { dueDate: null } },
    //     errors: [],
    //     notes: [],
    //     hasUidRules: false,
    //   },
    // },
    {
      name: 'always-open with non-standard credit',
      rules: [{ credit: 120 }],
      expected: {
        archetype: { base: 'always-open', modifiers: [] },
        result: {},
        errors: ['A 100% credit window is required.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'practice-only (credit 0 with dates)',
      rules: [{ credit: 0, startDate: '2021-10-13T00:00:00', endDate: '2022-01-18T23:59:59' }],
      expected: {
        archetype: { base: 'practice-only', modifiers: [] },
        result: {},
        errors: ['Using 0 credit to indicate overall weight within the course is not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'practice-only (implicit credit 0 with startDate only)',
      rules: [{ startDate: '2000-01-01T12:00:00' }],
      expected: {
        archetype: { base: 'practice-only', modifiers: [] },
        result: {},
        errors: ['Using 0 credit to indicate overall weight within the course is not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'single-deadline with practice window',
      rules: [
        {
          mode: 'Public',
          credit: 100,
          startDate: '2021-03-20T00:00:01',
          endDate: '2021-03-23T23:59:59',
        },
        // Legacy system uses rule with highest credit, so this is effectively
        // the same as saying the startDate is 2021-03-23T23:59:59.
        {
          mode: 'Public',
          startDate: '2021-03-20T00:00:01',
          endDate: '2021-04-30T23:59:59',
        },
      ],
      expected: {
        archetype: { base: 'single-deadline', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2021-03-20T00:00:01',
            dueDate: '2021-03-23T23:59:59',
            afterLastDeadline: { allowSubmissions: true, credit: 0 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'open-ended full credit (startDate, no endDate)',
      rules: [{ credit: 100, startDate: '2024-01-01' }],
      expected: {
        archetype: { base: 'single-deadline', modifiers: [] },
        result: { dateControl: { releaseDate: '2024-01-01', dueDate: null } },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'open-ended reduced credit (startDate, no endDate)',
      rules: [{ credit: 50, startDate: '2024-01-01' }],
      expected: {
        archetype: { base: 'single-reduced-credit', modifiers: [] },
        result: {},
        errors: ['Open-ended credit windows cannot be automatically migrated.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'declining-credit with open-ended trailing rule',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 50, startDate: '2024-03-01' },
      ],
      expected: {
        archetype: { base: 'declining-credit', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2024-01-01',
            dueDate: '2024-03-01',
            afterLastDeadline: { allowSubmissions: true, credit: 50 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'afterComplete for showClosedAssessment:false',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          showClosedAssessment: false,
        },
      ],
      expected: {
        archetype: { base: 'single-deadline', modifiers: ['hides-closed'] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
          afterComplete: { questions: { hidden: true } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'afterComplete for showClosedAssessmentScore:false',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          showClosedAssessmentScore: false,
        },
      ],
      expected: {
        archetype: { base: 'single-deadline', modifiers: ['hides-score'] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
          afterComplete: { score: { hidden: true } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'both questions and score hidden in afterComplete',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
      ],
      expected: {
        archetype: { base: 'single-deadline', modifiers: ['hides-closed'] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
          afterComplete: { questions: { hidden: true }, score: { hidden: true } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'separate reveal dates for questions and scores',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
        { active: false, startDate: '2024-07-01', showClosedAssessmentScore: false },
        { active: false, startDate: '2024-09-01' },
      ],
      expected: {
        archetype: { base: 'single-deadline-with-viewing', modifiers: ['hides-closed'] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-07-01' },
            score: { hidden: true, visibleFromDate: '2024-09-01' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'same reveal date when both questions and scores reveal together',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
        { active: false, startDate: '2024-09-01' },
      ],
      expected: {
        archetype: { base: 'single-deadline-with-viewing', modifiers: ['hides-closed'] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-09-01' },
            score: { hidden: true, visibleFromDate: '2024-09-01' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'pre-release listing and later reveal',
      rules: [
        { endDate: '2030-01-01T00:00:00', active: false },
        {
          credit: 100,
          timeLimitMin: 50,
          startDate: '2030-01-01T00:00:01',
          endDate: '2030-01-01T23:59:59',
          showClosedAssessment: false,
        },
        { active: false, startDate: '2030-01-04T00:00:01' },
      ],
      expected: {
        archetype: { base: 'timed-assessment', modifiers: ['hides-closed'] },
        result: {
          listBeforeRelease: true,
          dateControl: {
            releaseDate: '2030-01-01T00:00:01',
            dueDate: '2030-01-01T23:59:59',
            durationMinutes: 50,
          },
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2030-01-04T00:00:01' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'filters UID rules and adds note',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-06-01' },
        { uids: ['user@example.com'], credit: 100, endDate: '2024-12-01' },
      ],
      expected: {
        archetype: { base: 'single-deadline', modifiers: [] },
        result: { dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' } },
        errors: [],
        notes: [
          'UID-based rules are excluded from the migrated JSON and must be recreated as enrollment overrides if needed.',
        ],
        hasUidRules: true,
      },
    },
    {
      name: 'multi-deadline contiguous',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
      ],
      expected: {
        archetype: { base: 'multi-deadline', modifiers: [] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: '2024-04-01' },
        },
        errors: [],
        notes: ['2 full-credit windows collapsed into single span: 2024-01-01 to 2024-04-01'],
        hasUidRules: false,
      },
    },
    // TODO: make the migration result pass validation.
    // {
    //   name: 'declining-credit with bonus and reduced (no full) omits dueDate',
    //   rules: [
    //     { credit: 120, startDate: '2024-01-01', endDate: '2024-02-01' },
    //     { credit: 50, startDate: '2024-02-01', endDate: '2024-06-01' },
    //   ],
    //   expected: {
    //     archetype: { base: 'declining-credit', modifiers: [] },
    //     result: {
    //       dateControl: {
    //         releaseDate: '2024-01-01',
    //         earlyDeadlines: [{ date: '2024-02-01', credit: 120 }],
    //         lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
    //       },
    //     },
    //     errors: [],
    //     notes: [],
    //     hasUidRules: false,
    //   },
    // },
    // {
    //   name: 'declining-credit with multiple bonus and reduced (no full) omits dueDate',
    //   rules: [
    //     { credit: 130, startDate: '2024-01-01', endDate: '2024-01-15' },
    //     { credit: 120, startDate: '2024-01-01', endDate: '2024-02-01' },
    //     { credit: 50, startDate: '2024-02-01', endDate: '2024-06-01' },
    //   ],
    //   expected: {
    //     archetype: { base: 'declining-credit', modifiers: [] },
    //     result: {
    //       dateControl: {
    //         releaseDate: '2024-01-01',
    //         earlyDeadlines: [
    //           { date: '2024-01-15', credit: 130 },
    //           { date: '2024-02-01', credit: 120 },
    //         ],
    //         lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
    //       },
    //     },
    //     errors: [],
    //     notes: [],
    //     hasUidRules: false,
    //   },
    // },
    {
      name: 'collapses dominated late deadlines',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 80, startDate: '2024-01-01', endDate: '2024-06-01' },
        { credit: 30, startDate: '2024-01-01', endDate: '2024-04-01' },
      ],
      expected: {
        archetype: { base: 'declining-credit', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2024-01-01',
            dueDate: '2024-03-01',
            lateDeadlines: [{ date: '2024-06-01', credit: 80 }],
          },
        },
        errors: [],
        notes: ['1 late deadline collapsed because higher-credit rules cover the same period.'],
        hasUidRules: false,
      },
    },
    // TODO: make the migration result pass validation.
    // {
    //   name: 'single-reduced-credit as late deadline without dueDate',
    //   rules: [{ credit: 50, startDate: '2024-01-01', endDate: '2024-06-01' }],
    //   expected: {
    //     archetype: { base: 'single-reduced-credit', modifiers: [] },
    //     result: {
    //       dateControl: {
    //         releaseDate: '2024-01-01',
    //         lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
    //       },
    //     },
    //     errors: [],
    //     notes: [],
    //     hasUidRules: false,
    //   },
    // },
    {
      name: 'single bonus credit as early deadline without dueDate',
      rules: [{ credit: 120, startDate: '2024-01-01', endDate: '2024-06-01' }],
      expected: {
        archetype: { base: 'single-deadline', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2024-01-01',
            earlyDeadlines: [{ date: '2024-06-01', credit: 120 }],
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'multiple prairietest exams',
      rules: [
        { examUuid: 'exam-1', credit: 100 },
        { examUuid: 'exam-2', credit: 100 },
      ],
      expected: {
        archetype: { base: 'no-op', modifiers: ['prairietest'] },
        result: {
          integrations: {
            prairieTest: { exams: [{ examUuid: 'exam-1' }, { examUuid: 'exam-2' }] },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'mode-gated hides-closed modifier',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          mode: 'Exam',
          showClosedAssessment: false,
        },
      ],
      expected: {
        archetype: { base: 'single-deadline', modifiers: ['mode-gated', 'hides-closed'] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
          afterComplete: { questions: { hidden: true } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'password-gated with practice window',
      rules: [
        {
          startDate: '2021-10-21T14:00:00',
          endDate: '2021-10-21T15:15:00',
          timeLimitMin: 55,
          password: 'password',
        },
        {
          startDate: '2021-10-20T14:00:00',
          endDate: '2021-12-19T15:15:00',
          credit: 0,
          active: false,
        },
      ],
      expected: {
        archetype: { base: 'password-gated', modifiers: [] },
        result: {
          dateControl: {
            password: 'password',
            releaseDate: '2021-10-21T14:00:00',
            dueDate: '2021-10-21T15:15:00',
            afterLastDeadline: { allowSubmissions: true, credit: 0 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    // TODO: make the migration result pass validation.
    // {
    //   name: 'password-gated without dates',
    //   rules: [{ password: 'secret', credit: 100 }],
    //   expected: {
    //     archetype: { base: 'password-gated', modifiers: [] },
    //     result: { dateControl: { password: 'secret' } },
    //     errors: [],
    //     notes: [],
    //     hasUidRules: false,
    //   },
    // },
    {
      name: 'unclassified (non-contiguous access windows)',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
        { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
      ],
      expected: {
        archetype: { base: 'unclassified', modifiers: [] },
        result: {},
        errors: ['Non-contiguous access windows are not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'unclassified (half-open gap)',
      rules: [
        { credit: 100, endDate: '2024-02-01' },
        { credit: 100, startDate: '2024-03-01' },
      ],
      expected: {
        archetype: { base: 'unclassified', modifiers: [] },
        result: {},
        errors: ['Non-contiguous access windows are not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    // TODO: make the migration result pass validation.
    // {
    //   name: 'half-open contiguous (endDate meets startDate)',
    //   rules: [
    //     { credit: 100, endDate: '2024-02-01' },
    //     { credit: 100, startDate: '2024-02-01' },
    //   ],
    //   expected: {
    //     archetype: { base: 'multi-deadline', modifiers: [] },
    //     result: {
    //       dateControl: { releaseDate: '2024-02-01', dueDate: '2024-02-01' },
    //     },
    //     errors: [],
    //     notes: ['2 full-credit windows collapsed into single span: 2024-02-01 to 2024-02-01'],
    //     hasUidRules: false,
    //   },
    // },
    {
      name: 'mode-gated only',
      rules: [{ mode: 'Exam' }],
      expected: {
        archetype: { base: 'mode-gated', modifiers: [] },
        result: {},
        errors: ['Mode-only access rules are not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'all-UID rules filtered to no-op',
      rules: [{ uids: ['user@example.com'], credit: 100, endDate: '2024-06-01' }],
      expected: {
        archetype: { base: 'no-op', modifiers: [] },
        result: {},
        errors: [],
        notes: [
          'An empty accessControl list signifies that no access is granted.',
          'UID-based rules are excluded from the migrated JSON and must be recreated as enrollment overrides if needed.',
        ],
        hasUidRules: true,
      },
    },
    {
      name: 'UID rules mixed with declining-credit',
      rules: [
        { credit: 100, startDate: '2024-01-01', endDate: '2024-03-01' },
        { credit: 50, startDate: '2024-03-01', endDate: '2024-06-01' },
        { uids: ['user@example.com'], credit: 100 },
      ],
      expected: {
        archetype: { base: 'declining-credit', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2024-01-01',
            dueDate: '2024-03-01',
            lateDeadlines: [{ date: '2024-06-01', credit: 50 }],
          },
        },
        errors: [],
        notes: [
          'UID-based rules are excluded from the migrated JSON and must be recreated as enrollment overrides if needed.',
        ],
        hasUidRules: true,
      },
    },
    {
      name: 'single-deadline with mode-gated',
      rules: [{ credit: 100, startDate: '2024-01-01', endDate: '2024-06-01', mode: 'Exam' }],
      expected: {
        archetype: { base: 'single-deadline', modifiers: ['mode-gated'] },
        result: {
          dateControl: { releaseDate: '2024-01-01', dueDate: '2024-06-01' },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
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
      expected: {
        archetype: { base: 'timed-assessment', modifiers: ['mode-gated'] },
        result: {
          dateControl: {
            releaseDate: '2024-01-01',
            dueDate: '2024-06-01',
            durationMinutes: 60,
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'near-contiguous windows with small gaps treated as contiguous',
      rules: [
        {
          credit: 100,
          startDate: '2023-02-14T11:00:01',
          endDate: '2023-02-18T23:59:59',
          showClosedAssessment: true,
        },
        {
          credit: 95,
          startDate: '2023-02-19T00:00:01',
          endDate: '2023-02-20T23:59:59',
          showClosedAssessment: true,
        },
        {
          credit: 0,
          startDate: '2023-02-21T00:00:01',
          endDate: '2023-04-30T23:59:59',
          showClosedAssessment: true,
        },
      ],
      expected: {
        archetype: { base: 'declining-credit', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2023-02-14T11:00:01',
            dueDate: '2023-02-18T23:59:59',
            lateDeadlines: [{ date: '2023-02-20T23:59:59', credit: 95 }],
            afterLastDeadline: { allowSubmissions: true, credit: 0 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'filters non-Student role rules and treats mode:Public as no-op',
      rules: [
        { role: 'TA', endDate: '2019-12-20T23:59:59' },
        {
          role: 'Student',
          mode: 'Public',
          credit: 100,
          startDate: '2019-09-03T12:00:01',
          endDate: '2019-12-20T23:59:59',
        },
      ],
      expected: {
        archetype: { base: 'single-deadline', modifiers: [] },
        result: {
          dateControl: {
            releaseDate: '2019-09-03T12:00:01',
            dueDate: '2019-12-20T23:59:59',
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
  ];

  it.each(cases)('$name', ({ rules, expected }) => {
    const result = migrateAllowAccess(rules);

    // Ensure that the result, whatever it is, passes validation.
    const validationErrors = validateRule(result.result, 'none');
    assert.deepEqual(validationErrors, []);

    assert.deepEqual(result, expected);
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
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.notes, [
          'An empty accessControl list signifies that no access is granted.',
        ]);
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

  it('clear strategy removes allowAccess', async () => {
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

        await applyMigrationToAssessmentFile(filePath, 'clear', false);

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

  it('migrate strategy without clearIncompatible and incompatible rules keeps allowAccess', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [
              { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
              { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isDefined(result.allowAccess);
        assert.isUndefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('migrate strategy with clearIncompatible removes incompatible rules', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Exam',
            title: 'E1',
            allowAccess: [
              { credit: 100, startDate: '2024-01-01', endDate: '2024-02-01' },
              { credit: 100, startDate: '2024-03-01', endDate: '2024-04-01' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', true);

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

        await applyMigrationToAssessmentFile(filePath, 'clear', false);

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

  it('clear with UID-only rules removes allowAccess without accessControl', async () => {
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

        await applyMigrationToAssessmentFile(filePath, 'clear', false);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.isUndefined(result.accessControl);
      },
      { unsafeCleanup: true },
    );
  });

  it('all-UID rules migrate to no-op accessControl', async () => {
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
        assert.lengthOf(result.accessControl, 1);
        assert.deepEqual(result.accessControl[0], {});
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
          questions: { hidden: true, visibleFromDate: '2030-01-04T00:00:01' },
        },
      },
    ]);
  });
});
