import * as fs from 'fs/promises';
import * as path from 'path';

import tmp from 'tmp-promise';
import { assert, describe, it } from 'vitest';

import { AccessControlJsonSchema } from '../../schemas/accessControl.js';
import type { AssessmentAccessRuleJson } from '../../schemas/infoAssessment.js';

import {
  type Migration,
  analyzeAssessmentFile,
  analyzeCourseInstanceAssessments,
  applyMigrationToAssessmentFile,
  migrateAllowAccess,
  migrateAssessmentJson,
} from './migration.js';
import { validateAccessControlRules } from './validation.js';

// Sentinel fallback used across all tests so `migrateAllowAccess` and the
// file-level helpers are exercised the same way production calls them.
// Cases whose legacy rules don't supply a startDate (always-open, password-only)
// get this fallback as their release date in `expected`.
const FALLBACK_RELEASE = '2000-01-01T00:00:00';

describe('migrateAllowAccess', () => {
  const cases: {
    name: string;
    rules: AssessmentAccessRuleJson[];
    expected: Migration;
  }[] = [
    {
      name: 'single-deadline',
      rules: [{ credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' }],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'single-deadline-with-viewing',
      rules: [
        { credit: 100, startDate: '2024-02-01T00:00:00', endDate: '2024-06-01T00:00:00' },
        { startDate: '2024-01-01T00:00:00', active: false },
      ],
      expected: {
        accessControl: {
          beforeRelease: { listed: true },
          dateControl: {
            release: { date: '2024-02-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'timed-assessment',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          timeLimitMin: 90,
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
            durationMinutes: 90,
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'timed-assessment-open-ended',
      rules: [{ credit: 100, timeLimitMin: 50, showClosedAssessment: false }],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: FALLBACK_RELEASE },
            durationMinutes: 50,
          },
          afterComplete: {
            questions: { hidden: true },
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
        { credit: 110, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 50, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00' },
            earlyDeadlines: [{ date: '2024-02-01T00:00:00', credit: 110 }],
            lateDeadlines: [{ date: '2024-06-01T00:00:00', credit: 50 }],
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
        { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34', credit: 100 },
        { startDate: '2024-01-01T00:00:00', active: false },
      ],
      expected: {
        accessControl: {
          dateControl: { release: { date: '2024-01-01T00:00:00' } },
          integrations: {
            prairieTest: { exams: [{ examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34' }] },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'view-only',
      rules: [{ startDate: '2024-01-01T00:00:00', active: false }],
      expected: {
        accessControl: {
          dateControl: { release: { date: '2024-01-01T00:00:00' } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'password-gated',
      rules: [
        {
          password: 'secret',
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            password: 'secret',
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
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
        accessControl: {},
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'no-op',
      rules: [{}],
      expected: {
        accessControl: {},
        errors: [],
        notes: ['An empty accessControl list signifies that no access is granted.'],
        hasUidRules: false,
      },
    },
    {
      name: 'always-open',
      rules: [{ credit: 100 }],
      expected: {
        accessControl: {
          dateControl: { release: { date: FALLBACK_RELEASE } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'always-open with non-standard credit',
      rules: [{ credit: 120 }],
      expected: {
        accessControl: null,
        errors: ['Open-ended credit windows without a 100% credit rule cannot be migrated.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'fallback release date after due date fails final validation',
      rules: [
        // This end date is before FALLBACK_RELEASE, forcing the fallback
        // release date through final date-ordering validation.
        { credit: 0, endDate: '1999-12-31T00:00:00' },
      ],
      expected: {
        accessControl: null,
        errors: [
          'Release date must be before due date.',
          'Due date must be after the earliest possible release date.',
        ],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'practice-only (credit 0 with dates)',
      rules: [{ credit: 0, startDate: '2021-10-13T00:00:00', endDate: '2022-01-18T23:59:59' }],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2021-10-13T00:00:00' },
            due: { date: '2022-01-18T23:59:59', credit: 0 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'practice-only (implicit credit 0 with startDate only)',
      rules: [{ startDate: '2000-01-01T12:00:00' }],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2000-01-01T12:00:00' },
            due: { date: null, credit: 0 },
          },
        },
        errors: [],
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
        {
          mode: 'Public',
          startDate: '2021-03-20T00:00:01',
          endDate: '2021-04-30T23:59:59',
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2021-03-20T00:00:01' },
            due: { date: '2021-03-23T23:59:59' },
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
      rules: [{ credit: 100, startDate: '2024-01-01T00:00:00' }],
      expected: {
        accessControl: {
          dateControl: { release: { date: '2024-01-01T00:00:00' } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'open-ended reduced credit (startDate, no endDate)',
      rules: [{ credit: 50, startDate: '2024-01-01T00:00:00' }],
      expected: {
        accessControl: null,
        errors: ['Open-ended credit windows without a 100% credit rule cannot be migrated.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'declining-credit with open-ended trailing rule',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 50, startDate: '2024-03-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00' },
            afterLastDeadline: { allowSubmissions: true, credit: 50 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'closed and open-ended at the same non-100 credit collapse to always-open at that credit',
      rules: [
        { credit: 50, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
        { credit: 50, startDate: '2024-01-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: null, credit: 50 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'open-ended credit higher than due-date credit promotes credit to higher value',
      rules: [
        { credit: 50, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
        { credit: 80, startDate: '2024-01-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: null, credit: 80 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'open-ended at 100% collapses non-full closed window to always-open at 100%',
      rules: [
        { credit: 50, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
        { credit: 100, startDate: '2024-01-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'non-monotonic credit (100% -> 80% -> 100% open) is rejected',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 80, startDate: '2024-03-01T00:00:00', endDate: '2024-04-01T00:00:00' },
        { credit: 100, startDate: '2024-04-01T00:00:00' },
      ],
      expected: {
        accessControl: null,
        errors: ['Credit must be non-increasing over time.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'non-monotonic credit (50% closed then 100% open from later date) is rejected',
      rules: [
        { credit: 50, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 100, startDate: '2024-03-01T00:00:00' },
      ],
      expected: {
        accessControl: null,
        errors: ['Credit must be non-increasing over time.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'early deadline preserved when full-credit closed meets full-credit open-ended',
      rules: [
        { credit: 110, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
        { credit: 100, startDate: '2024-02-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 100, startDate: '2024-03-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: null },
            earlyDeadlines: [{ date: '2024-02-01T00:00:00', credit: 110 }],
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'bonus closed window followed by full-credit open-ended window becomes early deadline',
      rules: [
        { credit: 110, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
        { credit: 100, startDate: '2024-02-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: null },
            earlyDeadlines: [{ date: '2024-02-01T00:00:00', credit: 110 }],
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'late deadline preserved when no open-ended rule exists to trigger simplification',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 80, startDate: '2024-03-01T00:00:00', endDate: '2024-04-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00' },
            lateDeadlines: [{ date: '2024-04-01T00:00:00', credit: 80 }],
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'pre-release listing, late-credit window, and later hidden review window',
      rules: [
        {
          active: false,
          credit: 0,
          startDate: '1999-01-01T00:00:01',
          endDate: '2019-12-31T23:59:59',
        },
        { credit: 100, startDate: '2020-01-01T00:00:01', endDate: '2020-12-31T23:59:59' },
        { credit: 75, startDate: '2021-01-01T00:00:00', endDate: '2030-12-31T23:59:59' },
        {
          active: false,
          credit: 0,
          showClosedAssessment: false,
          startDate: '2035-01-01T00:00:01',
          endDate: '2039-12-31T23:59:59',
        },
        {
          active: false,
          credit: 0,
          startDate: '2040-01-01T00:00:01',
          endDate: '2049-12-31T23:59:59',
        },
      ],
      expected: {
        accessControl: {
          beforeRelease: { listed: true },
          dateControl: {
            release: { date: '2020-01-01T00:00:01' },
            due: { date: '2020-12-31T23:59:59' },
            lateDeadlines: [{ date: '2030-12-31T23:59:59', credit: 75 }],
          },
          afterComplete: {
            questions: {
              hidden: true,
              visibleFromDate: '2040-01-01T00:00:01',
              visibleUntilDate: '2049-12-31T23:59:59',
            },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'later bounded review window is preserved',
      rules: [
        {
          active: false,
          credit: 0,
          startDate: '1999-01-01T00:00:01',
          endDate: '2019-12-31T23:59:59',
        },
        { credit: 100, startDate: '2020-01-01T00:00:01', endDate: '2020-12-31T23:59:59' },
        { credit: 75, startDate: '2021-01-01T00:00:00', endDate: '2030-12-31T23:59:59' },
        {
          active: false,
          credit: 0,
          startDate: '2040-01-01T00:00:01',
          endDate: '2049-12-31T23:59:59',
        },
      ],
      expected: {
        accessControl: {
          beforeRelease: { listed: true },
          dateControl: {
            release: { date: '2020-01-01T00:00:01' },
            due: { date: '2020-12-31T23:59:59' },
            lateDeadlines: [{ date: '2030-12-31T23:59:59', credit: 75 }],
          },
          afterComplete: {
            questions: {
              hidden: true,
              visibleFromDate: '2040-01-01T00:00:01',
              visibleUntilDate: '2049-12-31T23:59:59',
            },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'contiguous review window without intermediate hidden window is supported',
      rules: [
        {
          startDate: '2023-02-07T13:00:00',
          endDate: '2023-02-27T23:59:00',
          credit: 100,
        },
        {
          startDate: '2023-02-28T00:00:00',
          endDate: '2023-05-15T23:59:00',
          active: false,
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2023-02-07T13:00:00' },
            due: { date: '2023-02-27T23:59:00' },
          },
          afterComplete: {
            questions: {
              hidden: true,
              visibleFromDate: '2023-02-28T00:00:00',
              visibleUntilDate: '2023-05-15T23:59:00',
            },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'late deadline preserved when open-ended credit is lower than due-date credit',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 80, startDate: '2024-03-01T00:00:00', endDate: '2024-04-01T00:00:00' },
        { credit: 50, startDate: '2024-04-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00' },
            lateDeadlines: [{ date: '2024-04-01T00:00:00', credit: 80 }],
            afterLastDeadline: { allowSubmissions: true, credit: 50 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'lower-credit rule fully covered by higher-credit rule is dropped',
      rules: [
        { credit: 50, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
        { credit: 80, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00', credit: 80 },
          },
        },
        errors: [],
        notes: ['1 credit window dropped because higher-credit rules cover the same period.'],
        hasUidRules: false,
      },
    },
    {
      name: 'lower-credit rule sharing endDate with higher-credit rule is dropped',
      rules: [
        { credit: 50, startDate: '2024-02-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 80, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00', credit: 80 },
          },
        },
        errors: [],
        notes: ['1 credit window dropped because higher-credit rules cover the same period.'],
        hasUidRules: false,
      },
    },
    {
      name: 'afterComplete for showClosedAssessment:false',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          showClosedAssessment: false,
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
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
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          showClosedAssessmentScore: false,
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
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
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
          afterComplete: { questions: { hidden: true }, score: { hidden: true } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'visibility-only inactive rule reports one completion mechanism error',
      rules: [
        {
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
          active: false,
        },
      ],
      expected: {
        accessControl: null,
        errors: [
          'After-complete settings require a deadline, duration limit, or PrairieTest exam.',
        ],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'separate reveal dates for questions and scores',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
        { active: false, startDate: '2024-07-01T00:00:00', showClosedAssessmentScore: false },
        { active: false, startDate: '2024-09-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-09-01T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-09-01T00:00:00' },
          },
        },
        errors: [],
        notes: [
          'Questions reveal date changed from 2024-07-01T00:00:00 to 2024-09-01T00:00:00 so questions do not become visible while the score is still hidden.',
        ],
        hasUidRules: false,
      },
    },
    {
      name: 'questions reveal date removed when score stays hidden forever',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
        { active: false, startDate: '2024-07-01T00:00:00', showClosedAssessmentScore: false },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
          afterComplete: { questions: { hidden: true }, score: { hidden: true } },
        },
        errors: [],
        notes: [
          'Questions reveal date 2024-07-01T00:00:00 was removed because score remains hidden after completion.',
        ],
        hasUidRules: false,
      },
    },
    {
      name: 'bounded question window cleared when score stays hidden forever',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
        {
          active: false,
          startDate: '2024-07-01T00:00:00',
          endDate: '2024-08-01T00:00:00',
          showClosedAssessmentScore: false,
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
          afterComplete: { questions: { hidden: true }, score: { hidden: true } },
        },
        errors: [],
        notes: [
          'Questions reveal date 2024-07-01T00:00:00 was removed because score remains hidden after completion.',
        ],
        hasUidRules: false,
      },
    },
    {
      name: 'same reveal date when both questions and scores reveal together',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
        { active: false, startDate: '2024-09-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-09-01T00:00:00' },
            score: { hidden: true, visibleFromDate: '2024-09-01T00:00:00' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'bounded review followed by unbounded reveal keeps questions visible',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          showClosedAssessment: false,
        },
        {
          active: false,
          startDate: '2024-07-01T00:00:00',
          endDate: '2024-08-01T00:00:00',
        },
        { active: false, startDate: '2024-09-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2024-07-01T00:00:00' },
          },
        },
        errors: [],
        notes: ['2 completed-question review windows collapsed into a single visibility window.'],
        hasUidRules: false,
      },
    },
    {
      name: 'adjacent bounded review windows merge without a note',
      rules: [
        {
          credit: 100,
          startDate: '2025-03-14T17:00:00',
          endDate: '2025-03-28T23:59:59',
        },
        {
          active: false,
          startDate: '2025-03-30T00:00:00',
          endDate: '2025-04-01T21:59:59',
        },
        {
          active: false,
          startDate: '2025-04-01T22:00:00',
          endDate: '2025-05-12T23:59:59',
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2025-03-14T17:00:00' },
            due: { date: '2025-03-28T23:59:59' },
          },
          afterComplete: {
            questions: {
              hidden: true,
              visibleFromDate: '2025-03-30T00:00:00',
              visibleUntilDate: '2025-05-12T23:59:59',
            },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'dates with fractional seconds and UTC suffix match input_date handling',
      rules: [
        {
          credit: 100,
          startDate: '2019-09-03T08:00:00.179Z',
          endDate: '2019-12-20T23:59:59.999Z',
          showClosedAssessment: false,
          showClosedAssessmentScore: false,
        },
        { active: false, startDate: '2020-01-01 12:34:56.789Z' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2019-09-03T08:00:00' },
            due: { date: '2019-12-20T23:59:59' },
          },
          afterComplete: {
            questions: { hidden: true, visibleFromDate: '2020-01-01T12:34:56' },
            score: { hidden: true, visibleFromDate: '2020-01-01T12:34:56' },
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
        accessControl: {
          beforeRelease: { listed: true },
          dateControl: {
            release: { date: '2030-01-01T00:00:01' },
            due: { date: '2030-01-01T23:59:59' },
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
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
        { uids: ['user@example.com'], credit: 100, endDate: '2024-12-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
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
      name: 'multi-deadline contiguous',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 100, startDate: '2024-03-01T00:00:00', endDate: '2024-04-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-04-01T00:00:00' },
          },
        },
        errors: [],
        notes: [
          '2 100% credit windows collapsed into single span: 2024-01-01T00:00:00 to 2024-04-01T00:00:00',
        ],
        hasUidRules: false,
      },
    },
    {
      name: 'declining-credit with bonus and reduced (no full) uses due credit',
      rules: [
        { credit: 120, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
        { credit: 50, startDate: '2024-02-01T00:00:00', endDate: '2024-06-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-02-01T00:00:00', credit: 120 },
            lateDeadlines: [{ date: '2024-06-01T00:00:00', credit: 50 }],
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'declining-credit with multiple bonus levels',
      rules: [
        { credit: 130, startDate: '2024-01-01T00:00:00', endDate: '2024-01-15T00:00:00' },
        { credit: 120, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
        { credit: 50, startDate: '2024-02-01T00:00:00', endDate: '2024-06-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-02-01T00:00:00', credit: 120 },
            earlyDeadlines: [{ date: '2024-01-15T00:00:00', credit: 130 }],
            lateDeadlines: [{ date: '2024-06-01T00:00:00', credit: 50 }],
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'collapses dominated late deadlines',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 80, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
        { credit: 30, startDate: '2024-01-01T00:00:00', endDate: '2024-04-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00' },
            lateDeadlines: [{ date: '2024-06-01T00:00:00', credit: 80 }],
          },
        },
        errors: [],
        notes: ['1 credit window dropped because higher-credit rules cover the same period.'],
        hasUidRules: false,
      },
    },
    {
      name: 'single-reduced-credit uses due credit',
      rules: [{ credit: 50, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' }],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00', credit: 50 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'single bonus credit uses due credit',
      rules: [{ credit: 120, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' }],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00', credit: 120 },
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
        { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34', credit: 100 },
        { examUuid: 'bffd5230-43a5-4be8-a87c-c43b5525bc65', credit: 100 },
      ],
      expected: {
        accessControl: {
          integrations: {
            prairieTest: {
              exams: [
                { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34' },
                { examUuid: 'bffd5230-43a5-4be8-a87c-c43b5525bc65' },
              ],
            },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'duplicate prairietest exam rules are collapsed',
      rules: [
        { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34', credit: 100 },
        { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34', credit: 100 },
        { examUuid: 'bffd5230-43a5-4be8-a87c-c43b5525bc65', credit: 100 },
      ],
      expected: {
        accessControl: {
          integrations: {
            prairieTest: {
              exams: [
                { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34' },
                { examUuid: 'bffd5230-43a5-4be8-a87c-c43b5525bc65' },
              ],
            },
          },
        },
        errors: [],
        notes: ['1 duplicate PrairieTest exam rule collapsed during migration.'],
        hasUidRules: false,
      },
    },
    {
      name: 'prairietest rule with password emits a warning note',
      rules: [
        { examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34', credit: 100, password: 'discarded' },
      ],
      expected: {
        accessControl: {
          integrations: {
            prairieTest: { exams: [{ examUuid: '8d38a804-7858-49a6-abe7-7a057604dd34' }] },
          },
        },
        errors: [],
        notes: [
          'Passwords on PrairieTest rules were discarded during migration; PrairieTest exams are gated by their own access controls.',
        ],
        hasUidRules: false,
      },
    },
    {
      name: 'mode-gated hides-closed modifier',
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          mode: 'Exam',
          showClosedAssessment: false,
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
          afterComplete: { questions: { hidden: true } },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'password-gated with view-only window extending past the deadline',
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
        accessControl: {
          beforeRelease: { listed: true },
          dateControl: {
            password: 'password',
            release: { date: '2021-10-21T14:00:00' },
            due: { date: '2021-10-21T15:15:00' },
            durationMinutes: 55,
          },
          afterComplete: {
            questions: {
              hidden: true,
              visibleFromDate: '2021-10-21T15:15:01',
              visibleUntilDate: '2021-12-19T15:15:00',
            },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'password-gated with earlier view-only rule keeps release at password startDate',
      rules: [
        { startDate: '2024-01-01T00:00:00', active: false },
        { password: 'secret', startDate: '2024-02-01T00:00:00', endDate: '2024-06-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          beforeRelease: { listed: true },
          dateControl: {
            password: 'secret',
            release: { date: '2024-02-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'password-gated without dates',
      rules: [{ password: 'secret', credit: 100 }],
      expected: {
        accessControl: {
          dateControl: {
            password: 'secret',
            release: { date: FALLBACK_RELEASE },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'password-gated with explicit credit:0 becomes credit-0 due window',
      rules: [
        {
          password: 'secret',
          credit: 0,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            password: 'secret',
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00', credit: 0 },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'multiple distinct passwords keeps the first and emits a note',
      rules: [
        {
          password: 'first',
          credit: 100,
          startDate: '2024-02-01T00:00:00',
          endDate: '2024-03-01T00:00:00',
        },
        {
          password: 'second',
          credit: 50,
          startDate: '2024-03-01T00:00:00',
          endDate: '2024-04-01T00:00:00',
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            password: 'first',
            release: { date: '2024-02-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00' },
            lateDeadlines: [{ credit: 50, date: '2024-04-01T00:00:00' }],
          },
        },
        errors: [],
        notes: [
          'Multiple distinct passwords were used in legacy access rules; only the first password was kept in the migrated configuration.',
        ],
        hasUidRules: false,
      },
    },
    {
      name: 'multiple rules sharing the same password do not emit a distinct-password note',
      rules: [
        {
          password: 'shared',
          credit: 100,
          startDate: '2024-03-01T00:00:00',
          endDate: '2024-04-01T00:00:00',
        },
        {
          password: 'shared',
          credit: 100,
          startDate: '2024-02-01T00:00:00',
          endDate: '2024-03-01T00:00:00',
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            password: 'shared',
            release: { date: '2024-02-01T00:00:00' },
            due: { date: '2024-04-01T00:00:00' },
          },
        },
        errors: [],
        notes: [
          '2 100% credit windows collapsed into single span: 2024-02-01T00:00:00 to 2024-04-01T00:00:00',
        ],
        hasUidRules: false,
      },
    },
    {
      name: 'practice before assessment opens',
      rules: [
        { credit: 0, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
        { credit: 100, startDate: '2024-02-01T00:00:00', endDate: '2024-06-01T00:00:00' },
      ],
      expected: {
        accessControl: null,
        errors: [
          'Practice windows before the assessment opens are not supported. Practice is only allowed after the assessment closes.',
        ],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'bonus-credit window extending past full-credit window dominates as the due',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 110, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00', credit: 110 },
          },
        },
        errors: [],
        notes: ['1 credit window dropped because higher-credit rules cover the same period.'],
        hasUidRules: false,
      },
    },
    {
      name: 'unclassified (non-contiguous access windows)',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
        { credit: 100, startDate: '2024-03-01T00:00:00', endDate: '2024-04-01T00:00:00' },
      ],
      expected: {
        accessControl: null,
        errors: ['Non-contiguous access windows are not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'unclassified (half-open gap)',
      rules: [
        { credit: 100, endDate: '2024-02-01T00:00:00' },
        { credit: 100, startDate: '2024-03-01T00:00:00' },
      ],
      expected: {
        accessControl: null,
        errors: ['Non-contiguous access windows are not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'unclassified (gapped zero-credit practice windows)',
      rules: [
        { credit: 0, startDate: '2024-01-01T00:00:00', endDate: '2024-01-31T00:00:00' },
        { credit: 0, startDate: '2024-04-01T00:00:00', endDate: '2024-04-30T00:00:00' },
      ],
      expected: {
        accessControl: null,
        errors: ['Non-contiguous access windows are not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'half-open contiguous (endDate meets startDate)',
      rules: [
        { credit: 100, endDate: '2024-02-01T00:00:00' },
        { credit: 100, startDate: '2024-02-01T00:00:00' },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-02-01T00:00:00' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'mode-gated only',
      rules: [{ mode: 'Exam' }],
      expected: {
        accessControl: null,
        errors: ['Mode-only access rules are not supported.'],
        notes: [],
        hasUidRules: false,
      },
    },
    {
      name: 'all-UID rules filtered to no-op',
      rules: [{ uids: ['user@example.com'], credit: 100, endDate: '2024-06-01T00:00:00' }],
      expected: {
        accessControl: {},
        errors: [],
        notes: [
          'UID-based rules are excluded from the migrated JSON and must be recreated as enrollment overrides if needed.',
          'An empty accessControl list signifies that no access is granted.',
        ],
        hasUidRules: true,
      },
    },
    {
      name: 'UID rules mixed with declining-credit',
      rules: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
        { credit: 50, startDate: '2024-03-01T00:00:00', endDate: '2024-06-01T00:00:00' },
        { uids: ['user@example.com'], credit: 100 },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-03-01T00:00:00' },
            lateDeadlines: [{ date: '2024-06-01T00:00:00', credit: 50 }],
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
      rules: [
        {
          credit: 100,
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          mode: 'Exam',
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
          },
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
          startDate: '2024-01-01T00:00:00',
          endDate: '2024-06-01T00:00:00',
          timeLimitMin: 60,
          mode: 'Exam',
        },
      ],
      expected: {
        accessControl: {
          dateControl: {
            release: { date: '2024-01-01T00:00:00' },
            due: { date: '2024-06-01T00:00:00' },
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
        accessControl: {
          dateControl: {
            release: { date: '2023-02-14T11:00:01' },
            due: { date: '2023-02-18T23:59:59' },
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
        accessControl: {
          dateControl: {
            release: { date: '2019-09-03T12:00:01' },
            due: { date: '2019-12-20T23:59:59' },
          },
        },
        errors: [],
        notes: [],
        hasUidRules: false,
      },
    },
  ];

  it.each(cases)('$name', ({ rules, expected }) => {
    const result = migrateAllowAccess(rules, FALLBACK_RELEASE);
    assert.deepEqual(result, expected);

    // Skip validation for migrations that errored out; there is no migrated
    // accessControl to validate.
    if (result.errors.length > 0) return;
    if (result.accessControl == null) {
      assert.fail('Expected migrated access control');
    }

    const zodResult = AccessControlJsonSchema.safeParse(result.accessControl);
    assert.isTrue(
      zodResult.success,
      zodResult.success ? '' : JSON.stringify(zodResult.error.issues, null, 2),
    );

    const { errors } = validateAccessControlRules({ rules: [result.accessControl] });
    assert.deepEqual(errors, []);
  });
});

describe('analyzeAssessmentFile', () => {
  it('returns null for assessments with no allowAccess', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(filePath, JSON.stringify({ type: 'Exam', title: 'Test' }));
        const result = await analyzeAssessmentFile(filePath, 'test', FALLBACK_RELEASE);
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
            accessControl: [{ dateControl: { release: { date: '2024-01-01T00:00:00' } } }],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'test', FALLBACK_RELEASE);
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
            allowAccess: [
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
            ],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'hw01', FALLBACK_RELEASE);
        assert.isNotNull(result);
        assert.equal(result.tid, 'hw01');
        assert.equal(result.errors.length, 0);
        assert.equal(result.hasUidRules, false);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.notes, []);
      },
      { unsafeCleanup: true },
    );
  });

  it('includes notes for visibility changes during analysis', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'Homework',
            title: 'HW1',
            allowAccess: [
              {
                credit: 100,
                startDate: '2024-01-01T00:00:00',
                endDate: '2024-06-01T00:00:00',
                showClosedAssessment: false,
                showClosedAssessmentScore: false,
              },
              {
                active: false,
                startDate: '2024-07-01T00:00:00',
                showClosedAssessmentScore: false,
              },
            ],
          }),
        );
        const result = await analyzeAssessmentFile(filePath, 'hw01', FALLBACK_RELEASE);
        assert.isNotNull(result);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.notes, [
          'Questions reveal date 2024-07-01T00:00:00 was removed because score remains hidden after completion.',
        ]);
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
        const result = await analyzeAssessmentFile(filePath, 'e01', FALLBACK_RELEASE);
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
        const result = await analyzeAssessmentFile(filePath, 'e01', FALLBACK_RELEASE);
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
        const result = await analyzeAssessmentFile(filePath, 'hw01', FALLBACK_RELEASE);
        assert.isNotNull(result);
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
        const result = await analyzeCourseInstanceAssessments(tmpDir, FALLBACK_RELEASE);
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
            allowAccess: [
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
            ],
          }),
        );
        await fs.writeFile(
          path.join(assessmentsDir, 'hw02', 'infoAssessment.json'),
          JSON.stringify({
            type: 'Homework',
            title: 'HW2',
          }),
        );

        const result = await analyzeCourseInstanceAssessments(tmpDir, FALLBACK_RELEASE);
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
          allowAccess: [
            { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
          ],
        };
        await fs.writeFile(filePath, JSON.stringify(originalData));

        await applyMigrationToAssessmentFile(filePath, 'keep', false, FALLBACK_RELEASE);

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
            allowAccess: [
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'clear', false, FALLBACK_RELEASE);

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
            allowAccess: [
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, FALLBACK_RELEASE);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.isDefined(result.accessControl);
        assert.lengthOf(result.accessControl, 1);
        assert.equal(result.accessControl[0].dateControl?.due?.date, '2024-06-01T00:00:00');
      },
      { unsafeCleanup: true },
    );
  });

  it('migrate strategy preserves property order', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        const filePath = path.join(tmpDir, 'infoAssessment.json');
        await fs.writeFile(
          filePath,
          JSON.stringify({
            uuid: '00000000-0000-0000-0000-000000000000',
            type: 'Homework',
            title: 'HW1',
            allowAccess: [
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
            ],
            zones: [],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, FALLBACK_RELEASE);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.deepEqual(Object.keys(result), ['uuid', 'type', 'title', 'accessControl', 'zones']);
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
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
              { credit: 100, startDate: '2024-03-01T00:00:00', endDate: '2024-04-01T00:00:00' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, FALLBACK_RELEASE);

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
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-02-01T00:00:00' },
              { credit: 100, startDate: '2024-03-01T00:00:00', endDate: '2024-04-01T00:00:00' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', true, FALLBACK_RELEASE);

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
          accessControl: [{ dateControl: { release: { date: '2024-01-01T00:00:00' } } }],
        };
        await fs.writeFile(filePath, JSON.stringify(originalData));

        await applyMigrationToAssessmentFile(filePath, 'clear', false, FALLBACK_RELEASE);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
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

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, FALLBACK_RELEASE);

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
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
              { uids: ['user@example.com'], credit: 100, endDate: '2024-12-01T00:00:00' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, FALLBACK_RELEASE);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.lengthOf(result.accessControl, 1);
        assert.equal(result.accessControl[0].dateControl?.due?.date, '2024-06-01T00:00:00');
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
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-03-01T00:00:00' },
              { credit: 50, startDate: '2024-03-01T00:00:00', endDate: '2024-06-01T00:00:00' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, FALLBACK_RELEASE);

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

        await applyMigrationToAssessmentFile(filePath, 'clear', false, FALLBACK_RELEASE);

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

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, FALLBACK_RELEASE);

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

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, FALLBACK_RELEASE);

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.isUndefined(result.allowAccess);
        assert.lengthOf(result.accessControl, 1);
        assert.deepEqual(result.accessControl[0], {});
      },
      { unsafeCleanup: true },
    );
  });

  it('uses fallback release date when migration produces dateControl without release', async () => {
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
        assert.equal(result.accessControl[0].dateControl?.release?.date, '2025-01-15T00:00:00');
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
            allowAccess: [
              { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
            ],
          }),
        );

        await applyMigrationToAssessmentFile(filePath, 'migrate', false, '2025-09-01T00:00:00');

        const result = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        assert.equal(result.accessControl[0].dateControl?.release?.date, '2024-01-01T00:00:00');
      },
      { unsafeCleanup: true },
    );
  });
});

describe('migrateAssessmentJson fallback release date', () => {
  it('uses fallback when migration produces dateControl without release', () => {
    const json = JSON.stringify({
      type: 'Homework',
      allowAccess: [{ password: 'secret', credit: 100 }],
    });
    const result = migrateAssessmentJson(json, '2025-01-15T00:00:00');
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.equal(parsed.accessControl[0].dateControl?.release?.date, '2025-01-15T00:00:00');
  });

  it('does not override existing release date with fallback', () => {
    const json = JSON.stringify({
      type: 'Homework',
      allowAccess: [
        { credit: 100, startDate: '2024-01-01T00:00:00', endDate: '2024-06-01T00:00:00' },
      ],
    });
    const result = migrateAssessmentJson(json, '2025-09-01T00:00:00');
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.equal(parsed.accessControl[0].dateControl?.release?.date, '2024-01-01T00:00:00');
  });

  it('does not add release when result has no dateControl', () => {
    const json = JSON.stringify({
      type: 'Homework',
      allowAccess: [{}],
    });
    const result = migrateAssessmentJson(json, '2025-01-15T00:00:00');
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.isUndefined(parsed.accessControl[0].dateControl);
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
    const result = migrateAssessmentJson(json, FALLBACK_RELEASE);
    assert.isNotNull(result);
    const parsed = JSON.parse(result.json);
    assert.deepEqual(parsed.accessControl, [
      {
        beforeRelease: { listed: true },
        dateControl: {
          release: { date: '2030-01-01T00:00:01' },
          due: { date: '2030-01-01T23:59:59' },
          durationMinutes: 50,
        },
        afterComplete: {
          questions: { hidden: true, visibleFromDate: '2030-01-04T00:00:01' },
        },
      },
    ]);
  });
});
