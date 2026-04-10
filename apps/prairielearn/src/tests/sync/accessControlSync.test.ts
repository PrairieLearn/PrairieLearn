import * as crypto from 'node:crypto';
import * as path from 'node:path';

import { merge } from 'es-toolkit';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectAccessControlRulesForAssessment } from '../../lib/assessment-access-control/data.js';
import { resolveAccessControl } from '../../lib/assessment-access-control/resolver.js';
import {
  AssessmentAccessControlEarlyDeadlineSchema,
  AssessmentAccessControlEnrollmentSchema,
  AssessmentAccessControlLateDeadlineSchema,
  type AssessmentAccessControlRule,
  AssessmentAccessControlRuleSchema,
  AssessmentAccessControlStudentLabelSchema,
  AssessmentSchema,
  CourseInstanceSchema,
} from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import { selectOrInsertUserByUid } from '../../models/user.js';
import { plainDateTimeStringToDate } from '../../pages/instructorInstanceAdminPublishing/utils/dateUtils.js';
import { type AccessControlJsonInput } from '../../schemas/accessControl.js';
import { cleanAccessControlRulesForDisk } from '../../trpc/assessment/access-control.js';
import * as helperDb from '../helperDb.js';
import { runInTransactionAndRollback } from '../helperDb.js';
import { withConfig } from '../utils/config.js';

import * as util from './util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Makes a basic access control rule for testing.
 */
function makeAccessControlRule(
  overrides: Partial<AccessControlJsonInput> = {},
): AccessControlJsonInput {
  if ('dateControl' in overrides && overrides.dateControl === undefined) {
    const { dateControl: _dateControl, ...rest } = overrides;
    return { ...rest };
  }
  return merge(
    {
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
      },
    },
    overrides,
  );
}

const TARGET_TYPE_ORDER: Record<AssessmentAccessControlRule['target_type'], number> = {
  none: 0,
  student_label: 1,
  enrollment: 2,
};

/** Helper to find a synced assessment by TID. */
async function getAssessment(assessmentTid: string) {
  const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
  const assessment = syncedAssessments.find((a) => a.tid === assessmentTid && a.deleted_at == null);
  assert.isOk(assessment);
  return assessment;
}

async function findSyncedAccessControlRules(assessmentId: string) {
  const assessment = await getAssessment(assessmentId);
  const dbId = assessment.id;

  const allRules = await util.dumpTableWithSchema(
    'assessment_access_control_rules',
    AssessmentAccessControlRuleSchema,
  );
  return allRules
    .filter((rule) => idsEqual(rule.assessment_id, dbId))
    .sort((a, b) => {
      const typeOrder = TARGET_TYPE_ORDER[a.target_type] - TARGET_TYPE_ORDER[b.target_type];
      if (typeOrder !== 0) return typeOrder;
      return a.number - b.number;
    });
}

/**
 * Helper to add a student label to the course instance JSON configuration.
 * Labels must be in the JSON config to persist through syncs, since
 * the syncStudentLabels function soft-deletes labels not in the config.
 */
function addStudentLabelToConfig(
  courseData: ReturnType<typeof util.getCourseData>,
  courseInstanceId: string,
  labelName: string,
) {
  const ci = courseData.courseInstances[courseInstanceId];
  if (!ci.courseInstance.studentLabels) {
    ci.courseInstance.studentLabels = [];
  }
  ci.courseInstance.studentLabels.push({
    uuid: crypto.randomUUID(),
    name: labelName,
    color: 'blue1',
  });
}

async function syncRulesAndRead(
  rules: AccessControlJsonInput[],
  opts?: { studentLabels?: string[]; courseDir?: string },
) {
  const courseData = util.getCourseData();
  for (const label of opts?.studentLabels ?? []) {
    addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, label);
  }
  courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
    util.ASSESSMENT_ID
  ].accessControl = rules;

  let courseDir: string;
  if (opts?.courseDir) {
    await util.writeCourseToDirectory(courseData, opts.courseDir);
    courseDir = opts.courseDir;
  } else {
    courseDir = await util.writeCourseToTempDirectory(courseData);
  }
  const syncResults = await util.syncCourseData(courseDir);

  assert(syncResults.status === 'complete');

  const assessment =
    syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[util.ASSESSMENT_ID];

  return {
    syncedRules: await findSyncedAccessControlRules(util.ASSESSMENT_ID),
    errors: assessment.errors,
    courseDir,
  };
}

const TEST_EXAM_UUID = '11e89892-3eff-4d7f-90a2-221372f14e5c';

describe('Access control syncing', () => {
  beforeAll(async () => {
    await helperDb.before();
    await features.enable('enhanced-access-control');
    await sqldb.executeRow(sql.insert_pt_exam, { uuid: TEST_EXAM_UUID });
  });

  afterAll(helperDb.after);

  describe('Basic rule syncing', () => {
    it('adds a new main access control rule', () =>
      runInTransactionAndRollback(async () => {
        const { syncedRules } = await syncRulesAndRead([makeAccessControlRule()]);
        assert.equal(syncedRules.length, 1);
        assert.equal(syncedRules[0].number, 0);
        assert.isNotNull(syncedRules[0].date_control_release_date);
        assert.equal(syncedRules[0].target_type, 'none');
      }));

    it('removes an access control rule', () =>
      runInTransactionAndRollback(async () => {
        const { syncedRules: initialRules, courseDir } = await syncRulesAndRead([
          makeAccessControlRule(),
        ]);
        assert.equal(initialRules.length, 1);

        const { syncedRules } = await syncRulesAndRead([], { courseDir });
        assert.equal(syncedRules.length, 0);
      }));

    it('updates an existing access control rule', () =>
      runInTransactionAndRollback(async () => {
        const { courseDir } = await syncRulesAndRead([
          makeAccessControlRule({ dateControl: { durationMinutes: 60 } }),
        ]);

        const { syncedRules } = await syncRulesAndRead(
          [makeAccessControlRule({ dateControl: { durationMinutes: 90 } })],
          { courseDir },
        );
        assert.equal(syncedRules.length, 1);
        assert.equal(syncedRules[0].date_control_duration_minutes, 90);
      }));
  });

  // The `_overridden` flags on each DB column track whether a field was
  // explicitly present in the source JSON. The mapping is:
  //   JSON field undefined → overridden=false, value=NULL  ("not configured")
  //   JSON field null      → overridden=true,  value=NULL  ("explicitly cleared")
  //   JSON field has value → overridden=true,  value=<val> ("explicitly set")
  //
  // For main rules (number=0), "not configured" simply means the field was
  // absent from the JSON — there is no parent to inherit from.
  // For overrides (number>0), "not configured" means "inherit from the main
  // rule"; the resolver's merge step skips undefined fields.
  describe('_overridden flag behavior on main rules', () => {
    it('fields present in JSON get overridden=true', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
            durationMinutes: 90,
            password: 'secret',
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        const row = syncedRules[0];
        assert.isNotNull(row.date_control_release_date);
        assert.isTrue(row.date_control_due_date_overridden);
        assert.isNotNull(row.date_control_due_date);
        assert.isTrue(row.date_control_duration_minutes_overridden);
        assert.equal(row.date_control_duration_minutes, 90);
        assert.isTrue(row.date_control_password_overridden);
        assert.equal(row.date_control_password, 'secret');
      }));

    it('fields absent from JSON get overridden=false and value=NULL', () =>
      runInTransactionAndRollback(async () => {
        const rule: AccessControlJsonInput = {
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            // dueDate, durationMinutes, password, deadlines all omitted
          },
        };
        const { syncedRules } = await syncRulesAndRead([rule]);
        const row = syncedRules[0];
        assert.isFalse(row.date_control_due_date_overridden);
        assert.isNull(row.date_control_due_date);
        assert.isFalse(row.date_control_duration_minutes_overridden);
        assert.isNull(row.date_control_duration_minutes);
        assert.isFalse(row.date_control_password_overridden);
        assert.isNull(row.date_control_password);
        assert.isFalse(row.date_control_early_deadlines_overridden);
        assert.isFalse(row.date_control_late_deadlines_overridden);
        assert.isFalse(row.date_control_after_last_deadline_credit_overridden);
        assert.isNull(row.date_control_after_last_deadline_credit);
        assert.isNull(row.date_control_after_last_deadline_allow_submissions);
      }));

    it('null fields get overridden=true with value=NULL', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: null,
            password: null,
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        const row = syncedRules[0];
        // Explicitly set to null: overridden=true, value=NULL
        assert.isTrue(row.date_control_due_date_overridden);
        assert.isNull(row.date_control_due_date);
        assert.isTrue(row.date_control_password_overridden);
        assert.isNull(row.date_control_password);
      }));

    it('no dateControl at all: all flags are overridden=false', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({ dateControl: undefined });
        const { syncedRules } = await syncRulesAndRead([rule]);
        const row = syncedRules[0];
        assert.isNull(row.date_control_release_date);
        assert.isFalse(row.date_control_due_date_overridden);
        assert.isFalse(row.date_control_duration_minutes_overridden);
        assert.isFalse(row.date_control_password_overridden);
        assert.isFalse(row.date_control_early_deadlines_overridden);
        assert.isFalse(row.date_control_late_deadlines_overridden);
        assert.isFalse(row.date_control_after_last_deadline_credit_overridden);
      }));

    it('afterComplete fields follow the same pattern', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          afterComplete: {
            hideQuestions: true,
            showQuestionsAgainDate: '2024-04-01T00:00:00',
            // hideScore and showScoreAgainDate omitted
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        const row = syncedRules[0];
        assert.equal(row.after_complete_hide_questions, true);
        assert.isTrue(row.after_complete_show_questions_again_date_overridden);
        assert.isNotNull(row.after_complete_show_questions_again_date);
        // Omitted fields
        assert.isNull(row.after_complete_hide_score);
        assert.isFalse(row.after_complete_show_score_again_date_overridden);
        assert.isNull(row.after_complete_show_score_again_date);
      }));
  });

  describe('_overridden flag behavior on override rules', () => {
    it('override with one field: only that field gets overridden=true', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Test Label';
        const mainRule = makeAccessControlRule({
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
            durationMinutes: 90,
            password: 'secret',
          },
        });
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          dateControl: {
            dueDate: '2024-04-01T23:59:00',
          },
        };
        const { syncedRules } = await syncRulesAndRead([mainRule, overrideRule], {
          studentLabels: [labelName],
        });
        const override = syncedRules.find((r) => r.target_type === 'student_label');
        assert.isOk(override);
        // Only dueDate was configured on the override
        assert.isTrue(override.date_control_due_date_overridden);
        assert.isNotNull(override.date_control_due_date);
        // Everything else should be overridden=false (inherit from main)
        assert.isNull(override.date_control_release_date);
        assert.isFalse(override.date_control_duration_minutes_overridden);
        assert.isNull(override.date_control_duration_minutes);
        assert.isFalse(override.date_control_password_overridden);
        assert.isNull(override.date_control_password);
        assert.isFalse(override.date_control_early_deadlines_overridden);
        assert.isFalse(override.date_control_late_deadlines_overridden);
      }));

    it('override with no dateControl: all flags are overridden=false', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Test Label';
        const mainRule = makeAccessControlRule();
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          // no dateControl at all — inherit everything
        };
        const { syncedRules } = await syncRulesAndRead([mainRule, overrideRule], {
          studentLabels: [labelName],
        });
        const override = syncedRules.find((r) => r.target_type === 'student_label');
        assert.isOk(override);
        assert.isNull(override.date_control_release_date);
        assert.isFalse(override.date_control_due_date_overridden);
        assert.isFalse(override.date_control_duration_minutes_overridden);
        assert.isFalse(override.date_control_password_overridden);
        assert.isFalse(override.date_control_early_deadlines_overridden);
        assert.isFalse(override.date_control_late_deadlines_overridden);
        assert.isFalse(override.date_control_after_last_deadline_credit_overridden);
      }));

    it('afterComplete override with one field: only that field is set', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Test Label';
        const mainRule = makeAccessControlRule({
          afterComplete: {
            hideQuestions: true,
            showQuestionsAgainDate: '2024-04-01T00:00:00',
            hideQuestionsAgainDate: '2024-05-01T00:00:00',
            hideScore: true,
            showScoreAgainDate: '2024-04-15T00:00:00',
          },
        });
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          afterComplete: {
            hideQuestions: false,
          },
        };
        const { syncedRules } = await syncRulesAndRead([mainRule, overrideRule], {
          studentLabels: [labelName],
        });
        const override = syncedRules.find((r) => r.target_type === 'student_label');
        assert.isOk(override);
        assert.equal(override.after_complete_hide_questions, false);
        // Date fields not set on the override should have overridden=false
        assert.isFalse(override.after_complete_show_questions_again_date_overridden);
        assert.isNull(override.after_complete_show_questions_again_date);
        assert.isFalse(override.after_complete_hide_questions_again_date_overridden);
        assert.isNull(override.after_complete_hide_questions_again_date);
        assert.isNull(override.after_complete_hide_score);
        assert.isFalse(override.after_complete_show_score_again_date_overridden);
        assert.isNull(override.after_complete_show_score_again_date);
      }));
  });

  describe('listBeforeRelease', () => {
    it.each([
      { input: true, expected: true },
      { input: false, expected: false },
      { input: undefined, expected: false },
    ])('syncs listBeforeRelease: $input -> $expected', ({ input, expected }) =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule(input !== undefined ? { listBeforeRelease: input } : {});
        const { syncedRules } = await syncRulesAndRead([rule]);
        assert.equal(syncedRules.length, 1);
        assert.equal(syncedRules[0].list_before_release, expected);
      }),
    );

    it('defaults to false in round-trip when omitted from JSON', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const mainRule: AccessControlJsonInput = {
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
          },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const main = rules.find((r) => r.number === 0);
        assert.isOk(main);
        assert.equal(main.rule.listBeforeRelease, false);
      }));

    it('preserves inheritance for label overrides when listBeforeRelease is omitted', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Extended time';
        const { syncedRules } = await syncRulesAndRead(
          [
            makeAccessControlRule({ listBeforeRelease: true }),
            makeAccessControlRule({
              labels: [labelName],
              dateControl: {
                dueDate: '2024-03-28T23:59:00',
              },
            }),
          ],
          {
            studentLabels: [labelName],
          },
        );

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const override = rules.find((rule) => rule.targetType === 'student_label');

        assert.isOk(override);
        assert.isUndefined(override.rule.listBeforeRelease);

        const overrideRow = syncedRules.find((rule) => rule.target_type === 'student_label');
        assert.isOk(overrideRow);
        assert.isNull(overrideRow.list_before_release);
      }));

    it('rejects listBeforeRelease on label-based overrides', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Extended time';
        const { errors } = await syncRulesAndRead(
          [
            makeAccessControlRule({ listBeforeRelease: false }),
            makeAccessControlRule({
              labels: [labelName],
              listBeforeRelease: true,
              dateControl: { dueDate: '2024-03-28T23:59:00' },
            }),
          ],
          { studentLabels: [labelName] },
        );
        assert.isTrue(
          errors.some((e) => e.includes('listBeforeRelease can only be specified on the defaults')),
        );
      }));
  });

  it('preserves existing access control rows when the assessment has unrelated sync errors', () =>
    runInTransactionAndRollback(async () => {
      const courseData = util.getCourseData();
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [makeAccessControlRule()];

      const { courseDir } = await util.writeAndSyncCourseData(courseData);

      let syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);

      delete (
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[util.ASSESSMENT_ID] as {
          title?: string;
        }
      ).title;

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);

      const assessment = await getAssessment(util.ASSESSMENT_ID);
      assert.isNotNull(assessment.sync_errors);
      assert.match(assessment.sync_errors, /must have required property 'title'/);
    }));

  describe('Date ordering validation', () => {
    it('rejects an override with an early deadline before its own release date', () =>
      runInTransactionAndRollback(async () => {
        const groupName = 'Extended time';
        const courseData = util.getCourseData();
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [
          makeAccessControlRule(),
          makeAccessControlRule({
            labels: [groupName],
            dateControl: {
              releaseDate: '2024-04-07T00:00:00',
              earlyDeadlines: [{ date: '2024-04-06T00:00:00', credit: 120 }],
            },
          }),
        ];

        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        assert.isNotNull(assessment.sync_errors);
        assert.match(assessment.sync_errors, /must be after the release date/);
      }));
  });

  describe('Deadline handling', () => {
    it('syncs early deadlines', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          dateControl: {
            earlyDeadlines: [
              { date: '2024-03-17T23:59:00', credit: 120 },
              { date: '2024-03-20T23:59:00', credit: 110 },
            ],
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        assert.equal(syncedRules[0].date_control_early_deadlines_overridden, true);

        const allDeadlines = await util.dumpTableWithSchema(
          'assessment_access_control_early_deadlines',
          AssessmentAccessControlEarlyDeadlineSchema,
        );
        const deadlines = allDeadlines.filter((d) =>
          idsEqual(d.assessment_access_control_rule_id, syncedRules[0].id),
        );
        assert.equal(deadlines.length, 2);
        assert.equal(deadlines[0].credit, 120);
        assert.equal(deadlines[1].credit, 110);
      }));

    it('syncs late deadlines', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          dateControl: {
            lateDeadlines: [
              { date: '2024-03-23T23:59:00', credit: 80 },
              { date: '2024-03-30T23:59:00', credit: 50 },
            ],
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        assert.equal(syncedRules[0].date_control_late_deadlines_overridden, true);

        const allDeadlines = await util.dumpTableWithSchema(
          'assessment_access_control_late_deadlines',
          AssessmentAccessControlLateDeadlineSchema,
        );
        const deadlines = allDeadlines.filter((d) =>
          idsEqual(d.assessment_access_control_rule_id, syncedRules[0].id),
        );
        assert.equal(deadlines.length, 2);
        assert.equal(deadlines[0].credit, 80);
        assert.equal(deadlines[1].credit, 50);
      }));

    // Override with empty array; we want the database to contain the overridden flag set to true,
    // with no entries in the join table
    it('syncs empty arrays correctly', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          dateControl: {
            lateDeadlines: [],
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        assert.equal(syncedRules[0].date_control_late_deadlines_overridden, true);

        const allDeadlines = await util.dumpTableWithSchema(
          'assessment_access_control_late_deadlines',
          AssessmentAccessControlLateDeadlineSchema,
        );
        const deadlines = allDeadlines.filter((d) =>
          idsEqual(d.assessment_access_control_rule_id, syncedRules[0].id),
        );
        assert.equal(deadlines.length, 0);
      }));

    it('removes deadlines when rule is updated', () =>
      runInTransactionAndRollback(async () => {
        const { syncedRules: initialRules, courseDir } = await syncRulesAndRead([
          makeAccessControlRule({
            dateControl: { lateDeadlines: [{ date: '2024-03-23T23:59:00', credit: 80 }] },
          }),
        ]);
        const allInitialDeadlines = await util.dumpTableWithSchema(
          'assessment_access_control_late_deadlines',
          AssessmentAccessControlLateDeadlineSchema,
        );
        const initialDeadlines = allInitialDeadlines.filter((d) =>
          idsEqual(d.assessment_access_control_rule_id, initialRules[0].id),
        );
        assert.equal(initialDeadlines.length, 1);

        const { syncedRules } = await syncRulesAndRead(
          [makeAccessControlRule({ dateControl: { lateDeadlines: [] } })],
          { courseDir },
        );
        const allSyncedDeadlines = await util.dumpTableWithSchema(
          'assessment_access_control_late_deadlines',
          AssessmentAccessControlLateDeadlineSchema,
        );
        const syncedDeadlines = allSyncedDeadlines.filter((d) =>
          idsEqual(d.assessment_access_control_rule_id, syncedRules[0].id),
        );
        assert.equal(syncedDeadlines.length, 0);
      }));
  });

  describe('Order management', () => {
    it('assigns correct number to multiple rules', () =>
      runInTransactionAndRollback(async () => {
        const labelName1 = 'Label A';
        const labelName2 = 'Label B';
        const { syncedRules } = await syncRulesAndRead(
          [
            makeAccessControlRule({
              dateControl: { releaseDate: '2024-03-14T00:01:00', durationMinutes: 60 },
            }),
            makeAccessControlRule({ labels: [labelName1], dateControl: { durationMinutes: 90 } }),
            makeAccessControlRule({ labels: [labelName2], dateControl: { durationMinutes: 120 } }),
          ],
          { studentLabels: [labelName1, labelName2] },
        );
        assert.equal(syncedRules.length, 3);

        assert.equal(syncedRules[0].number, 0);
        assert.equal(syncedRules[0].date_control_duration_minutes, 60);
        assert.isNotNull(syncedRules[0].date_control_release_date);

        // Override rules inherit releaseDate from makeAccessControlRule defaults.
        assert.equal(syncedRules[1].number, 1);
        assert.equal(syncedRules[1].date_control_duration_minutes, 90);
        assert.isNotNull(syncedRules[1].date_control_release_date);

        assert.equal(syncedRules[2].number, 2);
        assert.equal(syncedRules[2].date_control_duration_minutes, 120);
        assert.isNotNull(syncedRules[2].date_control_release_date);
      }));

    it('maintains number when rules are updated', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Test Label';
        const { courseDir } = await syncRulesAndRead(
          [
            makeAccessControlRule({ dateControl: { durationMinutes: 60 } }),
            makeAccessControlRule({ labels: [labelName], dateControl: { durationMinutes: 90 } }),
          ],
          { studentLabels: [labelName] },
        );

        const { syncedRules } = await syncRulesAndRead(
          [
            makeAccessControlRule({ dateControl: { durationMinutes: 75 } }),
            makeAccessControlRule({ labels: [labelName], dateControl: { durationMinutes: 90 } }),
          ],
          { studentLabels: [labelName], courseDir },
        );
        assert.equal(syncedRules.length, 2);
        assert.equal(syncedRules[0].number, 0);
        assert.equal(syncedRules[0].date_control_duration_minutes, 75);
        assert.equal(syncedRules[1].number, 1);
        assert.equal(syncedRules[1].date_control_duration_minutes, 90);
      }));

    it('deletes excess rules when syncing fewer rules', () =>
      runInTransactionAndRollback(async () => {
        const labelName1 = 'Label A';
        const labelName2 = 'Label B';
        const labels = [labelName1, labelName2];
        const { syncedRules: initialRules, courseDir } = await syncRulesAndRead(
          [
            makeAccessControlRule({ dateControl: { durationMinutes: 60 } }),
            makeAccessControlRule({ labels: [labelName1], dateControl: { durationMinutes: 90 } }),
            makeAccessControlRule({ labels: [labelName2], dateControl: { durationMinutes: 120 } }),
          ],
          { studentLabels: labels },
        );
        assert.equal(initialRules.length, 3);

        const { syncedRules } = await syncRulesAndRead(
          [makeAccessControlRule({ dateControl: { durationMinutes: 60 } })],
          { studentLabels: labels, courseDir },
        );
        assert.equal(syncedRules.length, 1);
        assert.equal(syncedRules[0].number, 0);
        assert.equal(syncedRules[0].date_control_duration_minutes, 60);
      }));

    it('respects rule number when label rules are renumbered', () =>
      runInTransactionAndRollback(async () => {
        const labelName1 = 'Label A';
        const labelName2 = 'Label B';
        const labels = [labelName1, labelName2];
        const assignmentRule = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
        const labelRule1 = makeAccessControlRule({
          labels: [labelName1],
          dateControl: { durationMinutes: 90 },
        });
        const labelRule2 = makeAccessControlRule({
          labels: [labelName2],
          dateControl: { durationMinutes: 120 },
        });

        const { syncedRules: initialRules, courseDir } = await syncRulesAndRead(
          [assignmentRule, labelRule1, labelRule2],
          { studentLabels: labels },
        );
        assert.equal(initialRules[0].date_control_duration_minutes, 60);
        assert.equal(initialRules[1].date_control_duration_minutes, 90);
        assert.equal(initialRules[2].date_control_duration_minutes, 120);

        // swap the label rules: [assignment, label2, label1]
        const { syncedRules } = await syncRulesAndRead([assignmentRule, labelRule2, labelRule1], {
          studentLabels: labels,
          courseDir,
        });
        assert.equal(syncedRules.length, 3);
        assert.equal(syncedRules[0].number, 0);
        assert.equal(syncedRules[0].date_control_duration_minutes, 60);
        assert.equal(syncedRules[1].number, 1);
        assert.equal(syncedRules[1].date_control_duration_minutes, 120);
        assert.equal(syncedRules[2].number, 2);
        assert.equal(syncedRules[2].date_control_duration_minutes, 90);
      }));
  });

  describe('Enrollment-level rule precedence', () => {
    it('preserves enrollment rules when label rules change', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName1 = 'Label A';
        const labelName2 = 'Label B';

        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName1);
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName2);

        const assignmentRule = makeAccessControlRule({
          dateControl: { durationMinutes: 60 },
        });
        const labelRule1 = makeAccessControlRule({
          labels: [labelName1],
          dateControl: { durationMinutes: 90 },
        });
        const labelRule2 = makeAccessControlRule({
          labels: [labelName2],
          dateControl: { durationMinutes: 120 },
        });

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [assignmentRule, labelRule1, labelRule2];

        const courseDir = await util.writeCourseToTempDirectory(courseData);
        await util.syncCourseData(courseDir);

        const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
        const assessment = syncedAssessments.find(
          (a) => a.tid === util.ASSESSMENT_ID && a.deleted_at == null,
        );
        assert.isOk(assessment);

        let allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        assert.equal(allRules.length, 3);
        assert.equal(allRules[0].number, 0);
        assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment
        assert.equal(allRules[1].number, 1);
        assert.equal(allRules[1].date_control_duration_minutes, 90); // label1
        assert.equal(allRules[2].number, 2);
        assert.equal(allRules[2].date_control_duration_minutes, 120); // label2

        // manually create 2 enrollment-level rules (UI creation)
        const user1 = await selectOrInsertUserByUid('user1@example.com');
        const user2 = await selectOrInsertUserByUid('user2@example.com');

        const enrollment1Id = await sqldb.queryScalar(
          sql.insert_enrollment,
          {
            user_id: user1.id,
            course_instance_id: assessment.course_instance_id,
            status: 'joined',
          },
          IdSchema,
        );

        const enrollment2Id = await sqldb.queryScalar(
          sql.insert_enrollment,
          {
            user_id: user2.id,
            course_instance_id: assessment.course_instance_id,
            status: 'joined',
          },
          IdSchema,
        );

        const enrollmentRule1Id = await sqldb.queryScalar(
          sql.insert_enrollment_access_control_rule,
          {
            assessment_id: assessment.id,
            number: 1,
            duration_minutes: 150,
          },
          IdSchema,
        );

        const enrollmentRule2Id = await sqldb.queryScalar(
          sql.insert_enrollment_access_control_rule,
          {
            assessment_id: assessment.id,
            number: 2,
            duration_minutes: 180,
          },
          IdSchema,
        );

        await sqldb.execute(sql.insert_enrollment_target, {
          assessment_access_control_rule_id: enrollmentRule1Id,
          enrollment_id: enrollment1Id,
        });
        await sqldb.execute(sql.insert_enrollment_target, {
          assessment_access_control_rule_id: enrollmentRule2Id,
          enrollment_id: enrollment2Id,
        });

        allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        assert.equal(allRules.length, 5);
        assert.equal(allRules[0].number, 0); // assignment (none)
        assert.equal(allRules[1].number, 1); // label1 (student_label)
        assert.equal(allRules[2].number, 2); // label2 (student_label)
        assert.equal(allRules[3].number, 1); // enrollment1
        assert.equal(allRules[3].date_control_duration_minutes, 150);
        assert.equal(allRules[4].number, 2); // enrollment2
        assert.equal(allRules[4].date_control_duration_minutes, 180);

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [assignmentRule, labelRule1];
        await util.overwriteAndSyncCourseData(courseData, courseDir);

        allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        assert.equal(allRules.length, 4);
        assert.equal(allRules[0].number, 0); // assignment (none)
        assert.equal(allRules[0].date_control_duration_minutes, 60);
        assert.equal(allRules[1].number, 1); // label1 (student_label)
        assert.equal(allRules[1].date_control_duration_minutes, 90);
        assert.equal(allRules[2].number, 1); // enrollment1
        assert.equal(allRules[2].date_control_duration_minutes, 150);
        assert.equal(allRules[3].number, 2); // enrollment2
        assert.equal(allRules[3].date_control_duration_minutes, 180);

        const allEnrollments = await util.dumpTableWithSchema(
          'assessment_access_control_enrollments',
          AssessmentAccessControlEnrollmentSchema,
        );
        const enrollmentTargets = allEnrollments.filter(
          (e) =>
            idsEqual(e.assessment_access_control_rule_id, allRules[2].id) ||
            idsEqual(e.assessment_access_control_rule_id, allRules[3].id),
        );
        assert.equal(enrollmentTargets.length, 2);

        const labelRule3 = makeAccessControlRule({
          labels: [labelName2], // reusing labelName2
          dateControl: { durationMinutes: 135 },
        });
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [assignmentRule, labelRule1, labelRule3];
        await util.overwriteAndSyncCourseData(courseData, courseDir);

        allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        assert.equal(allRules.length, 5);
        assert.equal(allRules[0].number, 0); // assignment (none)
        assert.equal(allRules[0].date_control_duration_minutes, 60);
        assert.equal(allRules[1].number, 1); // label1 (student_label)
        assert.equal(allRules[1].date_control_duration_minutes, 90);
        assert.equal(allRules[2].number, 2); // label3 (student_label, new)
        assert.equal(allRules[2].date_control_duration_minutes, 135);
        assert.equal(allRules[3].number, 1); // enrollment1
        assert.equal(allRules[3].date_control_duration_minutes, 150);
        assert.equal(allRules[4].number, 2); // enrollment2
        assert.equal(allRules[4].date_control_duration_minutes, 180);

        const finalEnrollments = await util.dumpTableWithSchema(
          'assessment_access_control_enrollments',
          AssessmentAccessControlEnrollmentSchema,
        );
        const finalTargets = finalEnrollments.filter(
          (e) =>
            idsEqual(e.assessment_access_control_rule_id, allRules[3].id) ||
            idsEqual(e.assessment_access_control_rule_id, allRules[4].id),
        );
        assert.equal(finalTargets.length, 2);
      }));

    it('preserves enrollment rules when label rules are removed', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'Test Label';

        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        const assignmentRule = makeAccessControlRule({
          dateControl: { durationMinutes: 60 },
        });
        const labelRule = makeAccessControlRule({
          labels: [labelName],
          dateControl: { durationMinutes: 90 },
        });

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [assignmentRule, labelRule];

        const courseDir = await util.writeCourseToTempDirectory(courseData);
        await util.syncCourseData(courseDir);

        const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
        const assessment = syncedAssessments.find(
          (a) => a.tid === util.ASSESSMENT_ID && a.deleted_at == null,
        );
        assert.isOk(assessment);

        const user = await selectOrInsertUserByUid('user@example.com');

        const enrollmentId = await sqldb.queryScalar(
          sql.insert_enrollment,
          { user_id: user.id, course_instance_id: assessment.course_instance_id, status: 'joined' },
          IdSchema,
        );

        const enrollmentRuleId = await sqldb.queryScalar(
          sql.insert_enrollment_access_control_rule,
          {
            assessment_id: assessment.id,
            number: 1,
            duration_minutes: 150,
          },
          IdSchema,
        );

        await sqldb.execute(sql.insert_enrollment_target, {
          assessment_access_control_rule_id: enrollmentRuleId,
          enrollment_id: enrollmentId,
        });

        let allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        assert.equal(allRules.length, 3);
        assert.equal(allRules[0].number, 0);
        assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment (none)
        assert.equal(allRules[1].number, 1);
        assert.equal(allRules[1].date_control_duration_minutes, 90); // label (student_label)
        assert.equal(allRules[2].number, 1);
        assert.equal(allRules[2].date_control_duration_minutes, 150); // enrollment

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [assignmentRule];
        await util.overwriteAndSyncCourseData(courseData, courseDir);

        allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        assert.equal(allRules.length, 2);
        assert.equal(allRules[0].number, 0);
        assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment (none)
        assert.equal(allRules[1].number, 1);
        assert.equal(allRules[1].date_control_duration_minutes, 150); // enrollment

        const allEnrollments = await util.dumpTableWithSchema(
          'assessment_access_control_enrollments',
          AssessmentAccessControlEnrollmentSchema,
        );
        const enrollmentTarget = allEnrollments.find((e) =>
          idsEqual(e.assessment_access_control_rule_id, allRules[1].id),
        );
        assert.isOk(enrollmentTarget);
      }));
  });

  describe('After complete settings', () => {
    it('syncs hideQuestions settings', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          afterComplete: {
            hideQuestions: true,
            showQuestionsAgainDate: '2025-03-25T23:59:00',
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        assert.equal(syncedRules.length, 1);
        assert.equal(syncedRules[0].after_complete_hide_questions, true);
        assert.equal(syncedRules[0].after_complete_show_questions_again_date_overridden, true);
        assert.isNotNull(syncedRules[0].after_complete_show_questions_again_date);
      }));

    it('syncs hideQuestionsAgainDate settings', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          afterComplete: {
            hideQuestions: true,
            showQuestionsAgainDate: '2025-03-25T23:59:00',
            hideQuestionsAgainDate: '2025-04-15T23:59:00',
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        assert.equal(syncedRules.length, 1);
        assert.equal(syncedRules[0].after_complete_hide_questions, true);
        assert.equal(syncedRules[0].after_complete_show_questions_again_date_overridden, true);
        assert.isNotNull(syncedRules[0].after_complete_show_questions_again_date);
        assert.equal(syncedRules[0].after_complete_hide_questions_again_date_overridden, true);
        assert.isNotNull(syncedRules[0].after_complete_hide_questions_again_date);
      }));

    it('syncs hideScore settings', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          afterComplete: {
            hideScore: true,
            showScoreAgainDate: '2025-03-25T23:59:00',
          },
        });
        const { syncedRules } = await syncRulesAndRead([rule]);
        assert.equal(syncedRules.length, 1);
        assert.equal(syncedRules[0].after_complete_hide_score, true);
        assert.equal(syncedRules[0].after_complete_show_score_again_date_overridden, true);
        assert.isNotNull(syncedRules[0].after_complete_show_score_again_date);
      }));
  });

  describe('Label-level rules', () => {
    it('syncs label-level access control rules', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Test Label';
        const assignmentRule = makeAccessControlRule({
          dateControl: { durationMinutes: 60 },
        });
        const labelRule = makeAccessControlRule({
          labels: [labelName],
          dateControl: { durationMinutes: 90 },
        });
        const { syncedRules } = await syncRulesAndRead([assignmentRule, labelRule], {
          studentLabels: [labelName],
        });
        assert.equal(syncedRules.length, 2);

        const allStudentLabels = await util.dumpTableWithSchema(
          'assessment_access_control_student_labels',
          AssessmentAccessControlStudentLabelSchema,
        );
        const labelTargets = allStudentLabels.filter((t) =>
          idsEqual(t.assessment_access_control_rule_id, syncedRules[1].id),
        );
        assert.equal(labelTargets.length, 1);
      }));

    it('rejects sync when label targets are invalid', () =>
      runInTransactionAndRollback(async () => {
        const { syncedRules, errors } = await syncRulesAndRead([
          makeAccessControlRule({ dateControl: { durationMinutes: 60 } }),
          makeAccessControlRule({
            labels: ['nonexistent-label'],
            dateControl: { durationMinutes: 90 },
          }),
        ]);
        assert.isTrue(errors.some((e) => e.includes('nonexistent-label')));
        assert.equal(syncedRules.length, 0);
      }));

    it('rejects adding a label to a rule that already has individual students', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'Test Label';

        // Add student label to config so it exists in DB after sync
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        // Sync the course to get the assessment and student label in the database
        await util.writeAndSyncCourseData(courseData);

        const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
        const assessment = syncedAssessments.find(
          (a) => a.tid === util.ASSESSMENT_ID && a.deleted_at == null,
        );
        assert.isOk(assessment);

        const user = await selectOrInsertUserByUid('user@example.com');

        const enrollmentId = await sqldb.queryScalar(
          sql.insert_enrollment,
          { user_id: user.id, course_instance_id: assessment.course_instance_id, status: 'joined' },
          IdSchema,
        );

        // Create an access control rule with target_type='enrollment' (must use number > 0)
        const ruleId = await sqldb.queryScalar(
          sql.insert_enrollment_access_control_rule,
          {
            assessment_id: assessment.id,
            number: 100,
            duration_minutes: null,
          },
          IdSchema,
        );

        await sqldb.execute(sql.insert_enrollment_target, {
          assessment_access_control_rule_id: ruleId,
          enrollment_id: enrollmentId,
        });

        const syncedCourseInstances = await util.dumpTableWithSchema(
          'course_instances',
          CourseInstanceSchema,
        );
        const courseInstance = syncedCourseInstances.find(
          (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
        );
        assert.isOk(courseInstance);

        const studentLabelId = await sqldb.queryScalar(
          sql.select_student_label_id,
          { name: labelName, course_instance_id: courseInstance.id },
          IdSchema,
        );

        // Try to add a student label to the same rule (should fail due to FK constraint)
        // The parent rule has target_type='enrollment', but the student_labels table
        // requires target_type='student_label', so the FK constraint will fail
        let errorThrown = false;
        try {
          await sqldb.execute(sql.insert_student_label_target, {
            assessment_access_control_rule_id: ruleId,
            student_label_id: studentLabelId,
          });
        } catch (error) {
          errorThrown = true;
          assert.include(
            String(error),
            'foreign key constraint',
            'Error should mention foreign key constraint violation',
          );
        }

        assert.isTrue(
          errorThrown,
          'A rule can be associated with labels or individual students, but not both',
        );
      }));
  });

  describe('Validation and errors', () => {
    it('records an error for invalid date formats', () =>
      runInTransactionAndRollback(async () => {
        const rule = makeAccessControlRule({
          dateControl: {
            releaseDate: 'not a valid date',
          },
        });
        // the rule should not be synced because it has validation errors
        const { syncedRules } = await syncRulesAndRead([rule]);
        assert.equal(syncedRules.length, 0, 'Rule with invalid date should not be synced');
      }));

    it('still rejects unknown labels when the course instance file is invalid', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [
          makeAccessControlRule({ dateControl: { durationMinutes: 60 } }),
          makeAccessControlRule({
            labels: ['foobar'],
            dateControl: { durationMinutes: 90 },
          }),
        ];

        const courseDir = await util.writeCourseToTempDirectory(courseData);
        const courseInstanceInfoPath = path.join(
          courseDir,
          'courseInstances',
          util.COURSE_INSTANCE_ID,
          'infoCourseInstance.json',
        );
        await fs.writeJSON(courseInstanceInfoPath, {
          uuid: courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.uuid,
        });

        const syncResults = await util.syncCourseData(courseDir);

        assert.equal(syncResults.status, 'complete');
        if (syncResults.status === 'complete') {
          const courseInstance = syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID];
          assert.isAbove(courseInstance.courseInstance.errors.length, 0);

          const assessment = courseInstance.assessments[util.ASSESSMENT_ID];
          assert.isTrue(
            assessment.errors.some((error) => error.includes('Invalid student label(s): foobar')),
          );
          assert.isFalse(
            assessment.errors.some((error) => error.includes('non-existent student labels')),
          );
        }

        const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        assert.equal(syncedRules.length, 0);
      }));

    it('still syncs labels that already exist in the database when the course instance file is invalid', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'foo';

        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [
          makeAccessControlRule({ dateControl: { durationMinutes: 60 } }),
          makeAccessControlRule({
            labels: [labelName],
            dateControl: { durationMinutes: 90 },
          }),
        ];

        const courseDir = await util.writeCourseToTempDirectory(courseData);
        await util.syncCourseData(courseDir);

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [
          makeAccessControlRule({ dateControl: { durationMinutes: 60 } }),
          makeAccessControlRule({
            labels: [labelName],
            dateControl: { durationMinutes: 120 },
          }),
        ];
        await util.writeCourseToDirectory(courseData, courseDir);

        const courseInstanceInfoPath = path.join(
          courseDir,
          'courseInstances',
          util.COURSE_INSTANCE_ID,
          'infoCourseInstance.json',
        );
        await fs.writeJSON(courseInstanceInfoPath, {
          uuid: courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.uuid,
        });

        const syncResults = await util.syncCourseData(courseDir);

        assert.equal(syncResults.status, 'complete');
        if (syncResults.status === 'complete') {
          const assessment =
            syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
              util.ASSESSMENT_ID
            ];
          assert.isFalse(
            assessment.errors.some((error) => error.includes('Invalid student label(s): foo')),
          );
        }

        const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        assert.equal(syncedRules.length, 2);
        assert.equal(syncedRules[1].date_control_duration_minutes, 120);
      }));

    it('rejects duplicate early deadline dates', () =>
      runInTransactionAndRollback(async () => {
        const { syncedRules, errors } = await syncRulesAndRead([
          makeAccessControlRule({
            dateControl: {
              dueDate: '2024-03-21T23:59:00',
              earlyDeadlines: [
                { date: '2024-03-18T23:59:00', credit: 120 },
                { date: '2024-03-18T23:59:00', credit: 110 },
              ],
            },
          }),
        ]);
        assert.isTrue(errors.some((e) => e.includes('Duplicate early deadline date')));
        assert.equal(syncedRules.length, 0);
      }));

    it('rejects duplicate late deadline dates', () =>
      runInTransactionAndRollback(async () => {
        const { syncedRules, errors } = await syncRulesAndRead([
          makeAccessControlRule({
            dateControl: {
              dueDate: '2024-03-21T23:59:00',
              lateDeadlines: [
                { date: '2024-03-28T23:59:00', credit: 50 },
                { date: '2024-03-28T23:59:00', credit: 25 },
              ],
            },
          }),
        ]);
        assert.isTrue(errors.some((e) => e.includes('Duplicate late deadline date')));
        assert.equal(syncedRules.length, 0);
      }));

    it('rejects sync when non-main rule specifies integrations', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Test Label';
        const { syncedRules, errors } = await syncRulesAndRead(
          [
            makeAccessControlRule({ dateControl: undefined }),
            makeAccessControlRule({
              labels: [labelName],
              dateControl: undefined,
              integrations: {
                prairieTest: { exams: [{ examUuid: TEST_EXAM_UUID }] },
              },
            }),
          ],
          { studentLabels: [labelName] },
        );
        assert.isTrue(
          errors.some((e) => e.includes('integrations can only be specified on the defaults')),
        );
        assert.equal(syncedRules.length, 0);
      }));

    it('allows main rule to specify integrations', () =>
      runInTransactionAndRollback(async () => {
        const labelName = 'Test Label';
        const { syncedRules } = await syncRulesAndRead(
          [
            makeAccessControlRule({
              dateControl: undefined,
              integrations: {
                prairieTest: { exams: [{ examUuid: TEST_EXAM_UUID }] },
              },
            }),
            makeAccessControlRule({ labels: [labelName], dateControl: undefined }),
          ],
          { studentLabels: [labelName] },
        );
        assert.equal(syncedRules.length, 2);
      }));

    it('rejects duplicate PrairieTest exam UUIDs', () =>
      runInTransactionAndRollback(async () => {
        const { syncedRules, errors } = await syncRulesAndRead([
          makeAccessControlRule({
            dateControl: undefined,
            integrations: {
              prairieTest: {
                exams: [{ examUuid: TEST_EXAM_UUID }, { examUuid: TEST_EXAM_UUID }],
              },
            },
          }),
        ]);
        assert.equal(syncedRules.length, 0);
        assert.isTrue(errors.some((e) => e.includes('Duplicate PrairieTest exam UUID')));
      }));

    it('rejects non-existent PrairieTest exam UUIDs when checkAccessRulesExamUuid is enabled', () =>
      runInTransactionAndRollback(() =>
        withConfig({ checkAccessRulesExamUuid: true }, async () => {
          const fakeUuid = '00000000-0000-0000-0000-000000000000';
          const { syncedRules, errors } = await syncRulesAndRead([
            makeAccessControlRule({
              dateControl: undefined,
              integrations: {
                prairieTest: {
                  exams: [{ examUuid: fakeUuid }],
                },
              },
            }),
          ]);
          assert.equal(syncedRules.length, 0);
          assert.isTrue(errors.some((e) => e.includes('Invalid PrairieTest exam UUID(s)')));
        }),
      ));

    it('allows non-existent PrairieTest exam UUIDs when checkAccessRulesExamUuid is disabled', () =>
      runInTransactionAndRollback(() =>
        withConfig({ checkAccessRulesExamUuid: false }, async () => {
          const fakeUuid = '00000000-0000-0000-0000-000000000000';
          const { syncedRules, errors } = await syncRulesAndRead([
            makeAccessControlRule({
              dateControl: undefined,
              integrations: {
                prairieTest: {
                  exams: [{ examUuid: fakeUuid }],
                },
              },
            }),
          ]);
          assert.equal(syncedRules.length, 1);
          assert.isFalse(errors.some((e) => e.includes('Invalid PrairieTest exam UUID(s)')));
        }),
      ));
  });

  // TODO: should we make more constants in util.ts for this?
  describe('Multiple assessments', () => {
    it('syncs access control for multiple assessments independently', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2 = {
          uuid: '03f3b4d2-0264-48b7-bf42-107732142c02',
          title: 'Test assessment 2',
          type: 'Exam',
          set: 'PRIVATE SET',
          number: '102',
          zones: [],
        };

        const rule1 = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
        const rule2 = makeAccessControlRule({ dateControl: { durationMinutes: 90 } });

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [rule1];
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2.accessControl = [
          rule2,
        ];

        await util.writeAndSyncCourseData(courseData);

        const syncedRules1 = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        const syncedRules2 = await findSyncedAccessControlRules('test2');

        assert.equal(syncedRules1.length, 1);
        assert.equal(syncedRules1[0].date_control_duration_minutes, 60);

        assert.equal(syncedRules2.length, 1);
        assert.equal(syncedRules2[0].date_control_duration_minutes, 90);
      }));

    it('does not let duplicate labels in one assessment block others from syncing', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'Test Label';

        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2 = {
          uuid: '15d421af-a8d4-45a9-bd74-78e8b222f833',
          title: 'Test assessment 2',
          type: 'Exam',
          set: 'PRIVATE SET',
          number: '102',
          zones: [],
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [makeAccessControlRule({ dateControl: { durationMinutes: 60 } })];
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2.accessControl = [
          makeAccessControlRule({ dateControl: { durationMinutes: 75 } }),
          makeAccessControlRule({
            labels: [labelName, labelName],
            dateControl: { durationMinutes: 90 },
          }),
        ];

        const { syncResults } = await util.writeAndSyncCourseData(courseData);

        assert.equal(syncResults.status, 'complete');
        if (syncResults.status === 'complete') {
          const invalidAssessment =
            syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2;
          assert.isOk(invalidAssessment.errors);
          assert.isTrue(
            invalidAssessment.errors.some((error) => error.includes('duplicate student labels')),
          );
        }

        const syncedRules1 = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        const syncedRules2 = await findSyncedAccessControlRules('test2');

        assert.equal(syncedRules1.length, 1);
        assert.equal(syncedRules1[0].date_control_duration_minutes, 60);
        assert.equal(syncedRules2.length, 0);
      }));

    it('does not let non-existent labels in one assessment block others from syncing', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2 = {
          uuid: '0c4bb13b-dbdb-4cd5-8e1a-e1dadd0a55f1',
          title: 'Test assessment 2',
          type: 'Exam',
          set: 'PRIVATE SET',
          number: '102',
          zones: [],
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [makeAccessControlRule({ dateControl: { durationMinutes: 60 } })];
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2.accessControl = [
          makeAccessControlRule({ dateControl: { durationMinutes: 75 } }),
          makeAccessControlRule({
            labels: ['missing-label'],
            dateControl: { durationMinutes: 90 },
          }),
        ];

        const { syncResults } = await util.writeAndSyncCourseData(courseData);

        assert.equal(syncResults.status, 'complete');
        if (syncResults.status === 'complete') {
          const invalidAssessment =
            syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2;
          assert.isOk(invalidAssessment.errors);
          assert.isTrue(invalidAssessment.errors.some((error) => error.includes('missing-label')));
        }

        const syncedRules1 = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
        const syncedRules2 = await findSyncedAccessControlRules('test2');

        assert.equal(syncedRules1.length, 1);
        assert.equal(syncedRules1[0].date_control_duration_minutes, 60);
        assert.equal(syncedRules2.length, 0);
      }));
  });

  describe('Round-trip', () => {
    const timezone = 'America/Chicago';

    it('preserves afterLastDeadline.allowSubmissions without credit on override', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'Test Label';
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        const mainRule = makeAccessControlRule({
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
            afterLastDeadline: { credit: 50, allowSubmissions: true },
          },
        });
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          dateControl: {
            afterLastDeadline: { allowSubmissions: false },
          },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule, overrideRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const override = rules.find((r) => r.number > 0);
        assert.isOk(override);
        assert.equal(override.rule.dateControl?.afterLastDeadline?.allowSubmissions, false);
      }));

    it('preserves hideQuestions without hideQuestionsAgainDate on override', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'Test Label';
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        const mainRule = makeAccessControlRule();
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          afterComplete: { hideQuestions: true },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule, overrideRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const override = rules.find((r) => r.number > 0);
        assert.isOk(override);
        assert.equal(override.rule.afterComplete?.hideQuestions, true);
      }));

    it('preserves hideScore without showScoreAgainDate on override', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'Test Label';
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        const mainRule = makeAccessControlRule();
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          afterComplete: { hideScore: true },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule, overrideRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const override = rules.find((r) => r.number > 0);
        assert.isOk(override);
        assert.equal(override.rule.afterComplete?.hideScore, true);
      }));

    it('override dateControl round-trips correctly', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.timezone = timezone;
        const labelName = 'Test Label';
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        const mainRule = makeAccessControlRule();
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          dateControl: {
            dueDate: '2024-04-01T23:59:00',
          },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule, overrideRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const override = rules.find((r) => r.number > 0);
        assert.isOk(override);
        assert.deepEqual(
          override.rule.dateControl?.dueDate,
          plainDateTimeStringToDate('2024-04-01T23:59:00', timezone),
        );
      }));

    it('explicit null override removals round-trip correctly', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'Test Label';
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        const mainRule: AccessControlJsonInput = {
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
            durationMinutes: 90,
            password: 'secret123',
            afterLastDeadline: { credit: 10, allowSubmissions: true },
          },
        };
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          dateControl: {
            durationMinutes: null,
            password: null,
            afterLastDeadline: null,
          },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule, overrideRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const override = rules.find((r) => r.number > 0);
        assert.isOk(override);
        assert.isOk(override.rule.dateControl);
        assert.strictEqual(override.rule.dateControl.durationMinutes, null);
        assert.strictEqual(override.rule.dateControl.password, null);
        assert.strictEqual(override.rule.dateControl.afterLastDeadline, null);
      }));

    it('explicit null override removals change resolved access behavior', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const labelName = 'Test Label';
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        const mainRule: AccessControlJsonInput = {
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
            durationMinutes: 90,
            password: 'secret123',
            afterLastDeadline: { credit: 10, allowSubmissions: true },
          },
        };
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          dateControl: {
            durationMinutes: null,
            password: null,
            afterLastDeadline: null,
          },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule, overrideRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const override = rules.find((r) => r.number > 0);
        assert.isOk(override);
        assert.equal(override.targetType, 'student_label');
        assert.lengthOf(override.studentLabelIds, 1);

        const beforeDueResult = resolveAccessControl({
          rules,
          enrollment: {
            enrollmentId: 'enroll-1',
            studentLabelIds: override.studentLabelIds,
          },
          date: new Date('2024-03-20T12:00:00Z'),
          displayTimezone: 'America/Chicago',
          authzMode: 'Public',
          courseRole: 'None',
          courseInstanceRole: 'None',
          prairieTestReservations: [],
        });
        assert.isNull(beforeDueResult.timeLimitMin);
        assert.isNull(beforeDueResult.password);

        const afterDueResult = resolveAccessControl({
          rules,
          enrollment: {
            enrollmentId: 'enroll-1',
            studentLabelIds: override.studentLabelIds,
          },
          date: new Date('2024-03-22T12:00:00Z'),
          displayTimezone: 'America/Chicago',
          authzMode: 'Public',
          courseRole: 'None',
          courseInstanceRole: 'None',
          prairieTestReservations: [],
        });
        assert.equal(afterDueResult.credit, 0);
        assert.isFalse(afterDueResult.active);
      }));

    it('only configured fields appear in the round-tripped JSON', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.timezone = timezone;
        const mainRule: AccessControlJsonInput = {
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
          },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const main = rules.find((r) => r.number === 0);
        assert.isOk(main);
        const dc = main.rule.dateControl;
        assert.isOk(dc);
        assert.deepEqual(
          dc.releaseDate,
          plainDateTimeStringToDate('2024-03-14T00:01:00', timezone),
        );
        assert.deepEqual(dc.dueDate, plainDateTimeStringToDate('2024-03-21T23:59:00', timezone));
        // Fields not in the original JSON should be absent
        assert.isUndefined(dc.durationMinutes);
        assert.isUndefined(dc.password);
        assert.isUndefined(dc.earlyDeadlines);
        assert.isUndefined(dc.lateDeadlines);
        assert.isUndefined(dc.afterLastDeadline);
      }));

    it('no dateControl in JSON produces no dateControl in round-trip', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        const mainRule: AccessControlJsonInput = {};

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const main = rules.find((r) => r.number === 0);
        assert.isOk(main);
        assert.isUndefined(main.rule.dateControl);
      }));

    it('all dateControl fields round-trip correctly', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.timezone = timezone;
        const mainRule: AccessControlJsonInput = {
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
            durationMinutes: 90,
            password: 'secret123',
            earlyDeadlines: [{ date: '2024-03-18T23:59:00', credit: 120 }],
            lateDeadlines: [{ date: '2024-03-28T23:59:00', credit: 50 }],
            afterLastDeadline: { credit: 10, allowSubmissions: true },
          },
          afterComplete: {
            hideQuestions: true,
            showQuestionsAgainDate: '2024-04-01T00:00:00',
            hideScore: true,
            showScoreAgainDate: '2024-04-15T00:00:00',
          },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const main = rules.find((r) => r.number === 0);
        assert.isOk(main);
        const dc = main.rule.dateControl;
        assert.isOk(dc);
        assert.deepEqual(
          dc.releaseDate,
          plainDateTimeStringToDate('2024-03-14T00:01:00', timezone),
        );
        assert.deepEqual(dc.dueDate, plainDateTimeStringToDate('2024-03-21T23:59:00', timezone));
        assert.equal(dc.durationMinutes, 90);
        assert.equal(dc.password, 'secret123');
        assert.equal(dc.earlyDeadlines?.length, 1);
        assert.equal(dc.earlyDeadlines?.[0].credit, 120);
        assert.equal(dc.lateDeadlines?.length, 1);
        assert.equal(dc.lateDeadlines?.[0].credit, 50);
        assert.equal(dc.afterLastDeadline?.credit, 10);
        assert.equal(dc.afterLastDeadline?.allowSubmissions, true);

        const ac = main.rule.afterComplete;
        assert.isOk(ac);
        assert.equal(ac.hideQuestions, true);
        assert.deepEqual(
          ac.showQuestionsAgainDate,
          plainDateTimeStringToDate('2024-04-01T00:00:00', timezone),
        );
        assert.equal(ac.hideScore, true);
        assert.deepEqual(
          ac.showScoreAgainDate,
          plainDateTimeStringToDate('2024-04-15T00:00:00', timezone),
        );
      }));

    it('override only includes its own configured fields, not inherited ones', () =>
      runInTransactionAndRollback(async () => {
        const courseData = util.getCourseData();
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.timezone = timezone;
        const labelName = 'Override Label';
        addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, labelName);

        const mainRule: AccessControlJsonInput = {
          dateControl: {
            releaseDate: '2024-03-14T00:01:00',
            dueDate: '2024-03-21T23:59:00',
            durationMinutes: 90,
            password: 'secret123',
          },
        };
        const overrideRule: AccessControlJsonInput = {
          labels: [labelName],
          dateControl: {
            dueDate: '2024-04-01T23:59:00',
          },
        };

        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule, overrideRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const override = rules.find((r) => r.number > 0);
        assert.isOk(override);
        const dc = override.rule.dateControl;
        assert.isOk(dc);
        // Only dueDate was configured on the override
        assert.deepEqual(dc.dueDate, plainDateTimeStringToDate('2024-04-01T23:59:00', timezone));
        // Fields from the main rule should NOT appear on the override's own JSON
        assert.isUndefined(dc.releaseDate);
        assert.isUndefined(dc.durationMinutes);
        assert.isUndefined(dc.password);
      }));

    it('PrairieTest exam UUIDs round-trip on main rule', () =>
      runInTransactionAndRollback(async () => {
        const mainRule = makeAccessControlRule({
          dateControl: undefined,
          integrations: {
            prairieTest: {
              exams: [{ examUuid: TEST_EXAM_UUID }],
            },
          },
        });

        const courseData = util.getCourseData();
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const main = rules.find((r) => r.number === 0);
        assert.isOk(main);
        assert.deepEqual(main.prairietestExams, [{ uuid: TEST_EXAM_UUID, readOnly: false }]);
        assert.deepEqual(main.rule.integrations, {
          prairieTest: {
            exams: [{ examUuid: TEST_EXAM_UUID, readOnly: false }],
          },
        });
      }));

    it('PrairieTest readOnly flag round-trips correctly', () =>
      runInTransactionAndRollback(async () => {
        const mainRule = makeAccessControlRule({
          dateControl: undefined,
          integrations: {
            prairieTest: {
              exams: [{ examUuid: TEST_EXAM_UUID, readOnly: true }],
            },
          },
        });

        const courseData = util.getCourseData();
        courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
          util.ASSESSMENT_ID
        ].accessControl = [mainRule];
        await util.writeAndSyncCourseData(courseData);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        const rules = await selectAccessControlRulesForAssessment(assessment);
        const main = rules.find((r) => r.number === 0);
        assert.isOk(main);
        assert.deepEqual(main.prairietestExams, [{ uuid: TEST_EXAM_UUID, readOnly: true }]);
      }));

    it('removes stale PrairieTest exam rows on re-sync', () =>
      runInTransactionAndRollback(async () => {
        const { courseDir } = await syncRulesAndRead([
          makeAccessControlRule({
            dateControl: undefined,
            integrations: {
              prairieTest: { exams: [{ examUuid: TEST_EXAM_UUID }] },
            },
          }),
        ]);

        const assessment = await getAssessment(util.ASSESSMENT_ID);
        let rules = await selectAccessControlRulesForAssessment(assessment);
        let main = rules.find((r) => r.number === 0);
        assert.isOk(main);
        assert.equal(main.prairietestExams.length, 1);

        // Re-sync without the exam — stale row should be cleaned up.
        await syncRulesAndRead([makeAccessControlRule()], { courseDir });

        rules = await selectAccessControlRulesForAssessment(assessment);
        main = rules.find((r) => r.number === 0);
        assert.isOk(main);
        assert.equal(main.prairietestExams.length, 0);
      }));
  });
});

describe('cleanAccessControlRulesForDisk', () => {
  it('omits listBeforeRelease: false and empty objects from output', () => {
    const rules: AccessControlJsonInput[] = [
      { listBeforeRelease: false, dateControl: {}, afterComplete: {} },
    ];

    const cleaned = cleanAccessControlRulesForDisk(rules);

    assert.equal(cleaned.length, 1);
    assert.notProperty(cleaned[0], 'listBeforeRelease');
    assert.notProperty(cleaned[0], 'dateControl');
    assert.notProperty(cleaned[0], 'afterComplete');
  });

  it('preserves listBeforeRelease: true on the main rule only', () => {
    const rules: AccessControlJsonInput[] = [
      makeAccessControlRule({ listBeforeRelease: true }),
      makeAccessControlRule({ listBeforeRelease: true }),
    ];

    const cleaned = cleanAccessControlRulesForDisk(rules);

    assert.equal(cleaned[0].listBeforeRelease, true);
    assert.notProperty(cleaned[1], 'listBeforeRelease');
  });

  it('includes non-empty dateControl and afterComplete', () => {
    const rules: AccessControlJsonInput[] = [
      makeAccessControlRule({
        dateControl: { dueDate: '2024-04-01T23:59:00' },
        afterComplete: { hideQuestions: true },
      }),
    ];

    const cleaned = cleanAccessControlRulesForDisk(rules);

    assert.deepEqual(cleaned[0].dateControl, {
      releaseDate: '2024-03-14T00:01:00',
      dueDate: '2024-04-01T23:59:00',
    });
    assert.deepEqual(cleaned[0].afterComplete, { hideQuestions: true });
  });
});
