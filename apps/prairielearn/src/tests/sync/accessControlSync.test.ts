import * as crypto from 'node:crypto';

import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectAccessControlRulesForAssessment } from '../../lib/access-control-data.js';
import {
  AssessmentAccessControlEarlyDeadlineSchema,
  AssessmentAccessControlEnrollmentSchema,
  AssessmentAccessControlLateDeadlineSchema,
  AssessmentAccessControlSchema,
  AssessmentAccessControlStudentLabelSchema,
  AssessmentSchema,
  CourseInstanceSchema,
} from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import { type AccessControlJsonInput } from '../../schemas/accessControl.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Makes a basic access control rule for testing.
 */
function makeAccessControlRule(
  overrides: Partial<AccessControlJsonInput> = {},
): AccessControlJsonInput {
  return {
    dateControl: {
      releaseDate: '2024-03-14T00:01:00',
      dueDate: '2024-03-21T23:59:00',
    },
    blockAccess: false, // provide a default non-null value
    ...overrides,
  };
}

const TARGET_TYPE_ORDER: Record<string, number> = {
  none: 0,
  student_label: 1,
  enrollment: 2,
};

/**
 * Helper to find synced access control rules for an assessment,
 * sorted by (target_type, number).
 */
async function getAssessmentDbId(assessmentTid: string): Promise<string> {
  const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
  const assessment = syncedAssessments.find((a) => a.tid === assessmentTid && a.deleted_at == null);
  assert.isOk(assessment);
  return assessment.id;
}

async function findSyncedAccessControlRules(assessmentId: string) {
  const dbId = await getAssessmentDbId(assessmentId);

  const allRules = await util.dumpTableWithSchema(
    'assessment_access_control',
    AssessmentAccessControlSchema,
  );
  return allRules
    .filter((rule) => idsEqual(rule.assessment_id, dbId))
    .sort((a, b) => {
      const typeOrder =
        (TARGET_TYPE_ORDER[a.target_type] ?? 99) - (TARGET_TYPE_ORDER[b.target_type] ?? 99);
      if (typeOrder !== 0) return typeOrder;
      return a.number - b.number;
    });
}

/**
 * Helper to add a student label to the course instance JSON configuration.
 * Groups must be in the JSON config to persist through syncs, since
 * the syncStudentLabels function soft-deletes groups not in the config.
 */
function addStudentLabelToConfig(
  courseData: ReturnType<typeof util.getCourseData>,
  courseInstanceId: string,
  groupName: string,
) {
  const ci = courseData.courseInstances[courseInstanceId];
  if (!ci.courseInstance.studentLabels) {
    ci.courseInstance.studentLabels = [];
  }
  ci.courseInstance.studentLabels.push({
    uuid: crypto.randomUUID(),
    name: groupName,
    color: 'blue1',
  });
}

describe('Access control syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(async () => {
    await helperDb.resetDatabase();
    await features.enable('enhanced-access-control');
  });

  describe('Basic rule syncing', () => {
    it('adds a new assignment-level access control rule', async () => {
      const { courseData, courseDir } = await util.createAndSyncCourseData();

      const newRule = makeAccessControlRule();
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [newRule];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].number, 0);
      assert.equal(syncedRules[0].date_control_release_date_overridden, true);
      // assignment-level rules have 'none' target_type (applies to all)
      assert.equal(syncedRules[0].target_type, 'none');
    });

    it('removes an access control rule', async () => {
      const courseData = util.getCourseData();

      const rule = makeAccessControlRule();
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(initialRules.length, 1);

      // Replace with a different rule (at least one assignment-level rule is required)
      const newRule = makeAccessControlRule({
        dateControl: { durationMinutes: 45 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [newRule];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].date_control_duration_minutes, 45);
    });

    it('updates an existing access control rule', async () => {
      const courseData = util.getCourseData();

      const rule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      rule.dateControl!.durationMinutes = 90;
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].date_control_duration_minutes, 90);
    });
  });

  describe('Three-way field mapping', () => {
    it('handles undefined fields (inherit)', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          // releaseDate is undefined - should inherit
          // releaseDate = undefined <=> release_date_override = false, release_date = NULL
          dueDate: '2024-03-21T23:59:00',
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.isFalse(syncedRules[0].date_control_release_date_overridden);
      assert.isNull(syncedRules[0].date_control_release_date);
      assert.isTrue(syncedRules[0].date_control_due_date_overridden);
      assert.isNotNull(syncedRules[0].date_control_due_date);
    });

    it('handles null fields (override and unset)', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          password: null, // explicitly override and remove password
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].date_control_password_overridden, true);
      assert.isNull(syncedRules[0].date_control_password);
    });

    it('handles value fields (override and set)', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].date_control_release_date_overridden, true);
      // Verify date is stored - the exact UTC value depends on server timezone
      assert.isNotNull(syncedRules[0].date_control_release_date);
      const storedDate = new Date(syncedRules[0].date_control_release_date);
      assert.isTrue(storedDate instanceof Date && !Number.isNaN(storedDate.getTime()));
    });
  });

  describe('blockAccess and listBeforeRelease', () => {
    it('syncs blockAccess: true', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({ blockAccess: true });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].block_access, true);
    });

    it('syncs blockAccess: false', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({ blockAccess: false });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].block_access, false);
    });

    it('defaults block_access to false when blockAccess is undefined', async () => {
      const courseData = util.getCourseData();
      const { blockAccess: _blockAccess, ...ruleWithoutBlockAccess } = makeAccessControlRule();
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [ruleWithoutBlockAccess];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].block_access, false);
    });

    it('syncs listBeforeRelease: true', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({ listBeforeRelease: true });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].list_before_release, true);
    });

    it('syncs listBeforeRelease: false', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({ listBeforeRelease: false });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].list_before_release, false);
    });

    it('defaults list_before_release to true when listBeforeRelease is undefined', async () => {
      const courseData = util.getCourseData();
      const { blockAccess: _blockAccess, ...ruleWithoutBlockAccess } = makeAccessControlRule();
      // blockAccess was the only non-undefined field from makeAccessControlRule defaults,
      // listBeforeRelease was already undefined, so this rule tests the default
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [ruleWithoutBlockAccess];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].list_before_release, true);
    });
  });

  describe('Deadline handling', () => {
    it('syncs early deadlines', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          earlyDeadlines: [
            { date: '2024-03-17T23:59:00', credit: 120 },
            { date: '2024-03-20T23:59:00', credit: 110 },
          ],
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules[0].date_control_early_deadlines_overridden, true);

      const allDeadlines = await util.dumpTableWithSchema(
        'assessment_access_control_early_deadline',
        AssessmentAccessControlEarlyDeadlineSchema,
      );
      const deadlines = allDeadlines.filter((d) =>
        idsEqual(d.assessment_access_control_id, syncedRules[0].id),
      );
      assert.equal(deadlines.length, 2);
      assert.equal(deadlines[0].credit, 120);
      assert.equal(deadlines[1].credit, 110);
    });

    it('syncs late deadlines', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          lateDeadlines: [
            { date: '2024-03-23T23:59:00', credit: 80 },
            { date: '2024-03-30T23:59:00', credit: 50 },
          ],
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules[0].date_control_late_deadlines_overridden, true);

      const allDeadlines = await util.dumpTableWithSchema(
        'assessment_access_control_late_deadline',
        AssessmentAccessControlLateDeadlineSchema,
      );
      const deadlines = allDeadlines.filter((d) =>
        idsEqual(d.assessment_access_control_id, syncedRules[0].id),
      );
      assert.equal(deadlines.length, 2);
      assert.equal(deadlines[0].credit, 80);
      assert.equal(deadlines[1].credit, 50);
    });

    // Override with empty array; we want the database to contain the overridden flag set to true,
    // with no entries in the join table
    it('syncs empty arrays correctly', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          lateDeadlines: [],
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules[0].date_control_late_deadlines_overridden, true);

      const allDeadlines = await util.dumpTableWithSchema(
        'assessment_access_control_late_deadline',
        AssessmentAccessControlLateDeadlineSchema,
      );
      const deadlines = allDeadlines.filter((d) =>
        idsEqual(d.assessment_access_control_id, syncedRules[0].id),
      );
      assert.equal(deadlines.length, 0);
    });

    it('removes deadlines when rule is updated', async () => {
      const courseData = util.getCourseData();

      const rule = makeAccessControlRule({
        dateControl: {
          lateDeadlines: [{ date: '2024-03-23T23:59:00', credit: 80 }],
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      const allInitialDeadlines = await util.dumpTableWithSchema(
        'assessment_access_control_late_deadline',
        AssessmentAccessControlLateDeadlineSchema,
      );
      const initialDeadlines = allInitialDeadlines.filter((d) =>
        idsEqual(d.assessment_access_control_id, initialRules[0].id),
      );
      assert.equal(initialDeadlines.length, 1);

      rule.dateControl!.lateDeadlines = [];
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      const allSyncedDeadlines = await util.dumpTableWithSchema(
        'assessment_access_control_late_deadline',
        AssessmentAccessControlLateDeadlineSchema,
      );

      const syncedDeadlines = allSyncedDeadlines.filter((d) =>
        idsEqual(d.assessment_access_control_id, syncedRules[0].id),
      );
      assert.equal(syncedDeadlines.length, 0);
    });
  });

  describe('Order management', () => {
    it('assigns correct number to multiple rules', async () => {
      const courseData = util.getCourseData();
      const groupName1 = 'Group A';
      const groupName2 = 'Group B';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName1);
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName2);

      const rule1 = makeAccessControlRule({
        dateControl: { releaseDate: '2024-03-14T00:01:00', durationMinutes: 60 },
      });
      const rule2 = makeAccessControlRule({
        labels: [groupName1],
        dateControl: { durationMinutes: 90 },
      });
      const rule3 = makeAccessControlRule({
        labels: [groupName2],
        dateControl: { durationMinutes: 120 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1, rule2, rule3];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 3);

      assert.equal(syncedRules[0].number, 0);
      assert.equal(syncedRules[0].date_control_duration_minutes, 60);
      assert.isNotNull(syncedRules[0].date_control_release_date);

      assert.equal(syncedRules[1].number, 1);
      assert.equal(syncedRules[1].date_control_duration_minutes, 90);
      assert.isNull(syncedRules[1].date_control_release_date);

      assert.equal(syncedRules[2].number, 2);
      assert.equal(syncedRules[2].date_control_duration_minutes, 120);
      assert.isNull(syncedRules[2].date_control_release_date);
    });

    it('maintains number when rules are updated', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      const rule1 = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
      const rule2 = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1, rule2];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      rule1.dateControl!.durationMinutes = 75;
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1, rule2];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 2);

      assert.equal(syncedRules[0].number, 0);
      assert.equal(syncedRules[0].date_control_duration_minutes, 75);

      assert.equal(syncedRules[1].number, 1);
      assert.equal(syncedRules[1].date_control_duration_minutes, 90);
    });

    it('deletes excess rules when syncing fewer rules', async () => {
      const courseData = util.getCourseData();
      const groupName1 = 'Group A';
      const groupName2 = 'Group B';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName1);
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName2);

      const rule1 = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
      const rule2 = makeAccessControlRule({
        labels: [groupName1],
        dateControl: { durationMinutes: 90 },
      });
      const rule3 = makeAccessControlRule({
        labels: [groupName2],
        dateControl: { durationMinutes: 120 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1, rule2, rule3];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(initialRules.length, 3);

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);

      assert.equal(syncedRules[0].number, 0);
      assert.equal(syncedRules[0].date_control_duration_minutes, 60);
    });

    // Validate renumbering group rules works in the database
    // Note: The assignment-level rule (target_type='none') must remain at position 0
    it('respects rule number when group rules are renumbered', async () => {
      const courseData = util.getCourseData();
      const groupName1 = 'Group A';
      const groupName2 = 'Group B';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName1);
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName2);

      const assignmentRule = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
      const groupRule1 = makeAccessControlRule({
        labels: [groupName1],
        dateControl: { durationMinutes: 90 },
      });
      const groupRule2 = makeAccessControlRule({
        labels: [groupName2],
        dateControl: { durationMinutes: 120 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule1, groupRule2];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(initialRules[0].date_control_duration_minutes, 60);
      assert.equal(initialRules[1].date_control_duration_minutes, 90);
      assert.equal(initialRules[2].date_control_duration_minutes, 120);

      // swap the group rules: [assignment, group2, group1]
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule2, groupRule1];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 3);
      assert.equal(syncedRules[0].number, 0);
      assert.equal(syncedRules[0].date_control_duration_minutes, 60); // assignment stays at 0
      assert.equal(syncedRules[1].number, 1);
      assert.equal(syncedRules[1].date_control_duration_minutes, 120); // group2 now at 1
      assert.equal(syncedRules[2].number, 2);
      assert.equal(syncedRules[2].date_control_duration_minutes, 90); // group1 now at 2
    });
  });

  describe('Enrollment-level rule precedence', () => {
    it('preserves enrollment rules when group rules change', async () => {
      const courseData = util.getCourseData();
      const groupName1 = 'Group A';
      const groupName2 = 'Group B';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName1);
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName2);

      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule1 = makeAccessControlRule({
        labels: [groupName1],
        dateControl: { durationMinutes: 90 },
      });
      const groupRule2 = makeAccessControlRule({
        labels: [groupName2],
        dateControl: { durationMinutes: 120 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule1, groupRule2];

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
      assert.equal(allRules[1].date_control_duration_minutes, 90); // group1
      assert.equal(allRules[2].number, 2);
      assert.equal(allRules[2].date_control_duration_minutes, 120); // group2

      // manually create 2 enrollment-level rules (UI creation)
      const user1Id = await sqldb.queryScalar(
        sql.insert_user,
        { uid: 'user1@example.com', name: 'User 1', institution_id: '1' },
        IdSchema,
      );

      const user2Id = await sqldb.queryScalar(
        sql.insert_user,
        { uid: 'user2@example.com', name: 'User 2', institution_id: '1' },
        IdSchema,
      );

      const enrollment1Id = await sqldb.queryScalar(
        sql.insert_enrollment,
        { user_id: user1Id, course_instance_id: assessment.course_instance_id, status: 'joined' },
        IdSchema,
      );

      const enrollment2Id = await sqldb.queryScalar(
        sql.insert_enrollment,
        { user_id: user2Id, course_instance_id: assessment.course_instance_id, status: 'joined' },
        IdSchema,
      );

      const enrollmentRule1Id = await sqldb.queryScalar(
        sql.insert_enrollment_access_control_rule,
        {
          course_instance_id: assessment.course_instance_id,
          assessment_id: assessment.id,
          number: 1,
          duration_minutes: 150,
        },
        IdSchema,
      );

      const enrollmentRule2Id = await sqldb.queryScalar(
        sql.insert_enrollment_access_control_rule,
        {
          course_instance_id: assessment.course_instance_id,
          assessment_id: assessment.id,
          number: 2,
          duration_minutes: 180,
        },
        IdSchema,
      );

      await sqldb.execute(sql.insert_enrollment_target, {
        assessment_access_control_id: enrollmentRule1Id,
        enrollment_id: enrollment1Id,
      });
      await sqldb.execute(sql.insert_enrollment_target, {
        assessment_access_control_id: enrollmentRule2Id,
        enrollment_id: enrollment2Id,
      });

      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(allRules.length, 5);
      assert.equal(allRules[0].number, 0); // assignment (none)
      assert.equal(allRules[1].number, 1); // group1 (student_label)
      assert.equal(allRules[2].number, 2); // group2 (student_label)
      assert.equal(allRules[3].number, 1); // enrollment1
      assert.equal(allRules[3].date_control_duration_minutes, 150);
      assert.equal(allRules[4].number, 2); // enrollment2
      assert.equal(allRules[4].date_control_duration_minutes, 180);

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule1];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(allRules.length, 4);
      assert.equal(allRules[0].number, 0); // assignment (none)
      assert.equal(allRules[0].date_control_duration_minutes, 60);
      assert.equal(allRules[1].number, 1); // group1 (student_label)
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
          idsEqual(e.assessment_access_control_id, allRules[2].id) ||
          idsEqual(e.assessment_access_control_id, allRules[3].id),
      );
      assert.equal(enrollmentTargets.length, 2);

      const groupRule3 = makeAccessControlRule({
        labels: [groupName2], // reusing groupName2
        dateControl: { durationMinutes: 135 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule1, groupRule3];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(allRules.length, 5);
      assert.equal(allRules[0].number, 0); // assignment (none)
      assert.equal(allRules[0].date_control_duration_minutes, 60);
      assert.equal(allRules[1].number, 1); // group1 (student_label)
      assert.equal(allRules[1].date_control_duration_minutes, 90);
      assert.equal(allRules[2].number, 2); // group3 (student_label, new)
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
          idsEqual(e.assessment_access_control_id, allRules[3].id) ||
          idsEqual(e.assessment_access_control_id, allRules[4].id),
      );
      assert.equal(finalTargets.length, 2);
    });

    it('preserves enrollment rules when group rules are removed', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
      const assessment = syncedAssessments.find(
        (a) => a.tid === util.ASSESSMENT_ID && a.deleted_at == null,
      );
      assert.isOk(assessment);

      const userId = await sqldb.queryScalar(
        sql.insert_user,
        { uid: 'user@example.com', name: 'Test User', institution_id: '1' },
        IdSchema,
      );

      const enrollmentId = await sqldb.queryScalar(
        sql.insert_enrollment,
        { user_id: userId, course_instance_id: assessment.course_instance_id, status: 'joined' },
        IdSchema,
      );

      const enrollmentRuleId = await sqldb.queryScalar(
        sql.insert_enrollment_access_control_rule,
        {
          course_instance_id: assessment.course_instance_id,
          assessment_id: assessment.id,
          number: 1,
          duration_minutes: 150,
        },
        IdSchema,
      );

      await sqldb.execute(sql.insert_enrollment_target, {
        assessment_access_control_id: enrollmentRuleId,
        enrollment_id: enrollmentId,
      });

      let allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(allRules.length, 3);
      assert.equal(allRules[0].number, 0);
      assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment (none)
      assert.equal(allRules[1].number, 1);
      assert.equal(allRules[1].date_control_duration_minutes, 90); // group (student_label)
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
        idsEqual(e.assessment_access_control_id, allRules[1].id),
      );
      assert.isOk(enrollmentTarget);
    });
  });

  describe('After complete settings', () => {
    it('syncs hideQuestions settings', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        afterComplete: {
          hideQuestions: true,
          showQuestionsAgainDate: '2025-03-25T23:59:00',
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].after_complete_hide_questions, true);
      assert.equal(syncedRules[0].after_complete_show_questions_again_date_overridden, true);
      assert.isNotNull(syncedRules[0].after_complete_show_questions_again_date);
    });

    it('syncs hideScore settings', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        afterComplete: {
          hideScore: true,
          showScoreAgainDate: '2025-03-25T23:59:00',
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].after_complete_hide_score, true);
      assert.equal(syncedRules[0].after_complete_show_score_again_date_overridden, true);
      assert.isNotNull(syncedRules[0].after_complete_show_score_again_date);
    });
  });

  describe('Group-level rules', () => {
    it('syncs group-level access control rules', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 2);

      const allStudentLabels = await util.dumpTableWithSchema(
        'assessment_access_control_student_labels',
        AssessmentAccessControlStudentLabelSchema,
      );
      const groupTargets = allStudentLabels.filter((t) =>
        idsEqual(t.assessment_access_control_id, syncedRules[1].id),
      );
      assert.equal(groupTargets.length, 1);
    });

    it('rejects sync when group targets are invalid', async () => {
      const courseData = util.getCourseData();

      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const ruleWithInvalidTarget = makeAccessControlRule({
        labels: ['nonexistent-group'],
        dateControl: { durationMinutes: 90 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, ruleWithInvalidTarget];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      const syncResults = await util.syncCourseData(courseDir);

      assert.equal(syncResults.status, 'complete');
      if (syncResults.status === 'complete') {
        const assessment =
          syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
            util.ASSESSMENT_ID
          ];
        assert.isOk(assessment.errors, 'Assessment should have errors');
        assert.isTrue(
          assessment.errors.some((error) => error.includes('nonexistent-group')),
          'Should have error mentioning the invalid label name',
        );
      }

      // No rules should be synced because the sync errored
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        0,
        'Should not sync any rules when there are invalid group targets',
      );
    });

    it('rejects adding a group to a rule that already has individual students', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      // Add student label to config so it exists in DB after sync
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // Sync the course to get the assessment and student label in the database
      await util.writeAndSyncCourseData(courseData);

      const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
      const assessment = syncedAssessments.find(
        (a) => a.tid === util.ASSESSMENT_ID && a.deleted_at == null,
      );
      assert.isOk(assessment);

      const userId = await sqldb.queryScalar(
        sql.insert_user,
        { uid: 'user@example.com', name: 'Test User', institution_id: '1' },
        IdSchema,
      );

      const enrollmentId = await sqldb.queryScalar(
        sql.insert_enrollment,
        { user_id: userId, course_instance_id: assessment.course_instance_id, status: 'joined' },
        IdSchema,
      );

      // Create an access control rule with target_type='enrollment' (must use number > 0)
      const ruleId = await sqldb.queryScalar(
        sql.insert_enrollment_access_control_rule,
        {
          course_instance_id: assessment.course_instance_id,
          assessment_id: assessment.id,
          number: 100,
          duration_minutes: null,
        },
        IdSchema,
      );

      await sqldb.execute(sql.insert_enrollment_target, {
        assessment_access_control_id: ruleId,
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
        { name: groupName, course_instance_id: courseInstance.id },
        IdSchema,
      );

      // Try to add a student label to the same rule (should fail due to FK constraint)
      // The parent rule has target_type='enrollment', but the student_labels table
      // requires target_type='student_label', so the FK constraint will fail
      let errorThrown = false;
      try {
        await sqldb.execute(sql.insert_student_label_target, {
          assessment_access_control_id: ruleId,
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
        'A rule can be associated with groups or individual students, but not both',
      );
    });
  });

  describe('Assignment-level rule requirement', () => {
    it('rejects sync when no assignment-level rule exists', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      const groupRule = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [groupRule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        0,
        'Should not sync any rules when there is no assignment-level rule',
      );
    });

    it('rejects sync when multiple assignment-level rules exist', async () => {
      const courseData = util.getCourseData();

      const rule1 = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const rule2 = makeAccessControlRule({
        dateControl: { durationMinutes: 90 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1, rule2];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        0,
        'Should not sync any rules when there are multiple assignment-level rules',
      );
    });

    it('successfully syncs with exactly one assignment-level rule', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 2, 'Should sync all rules when properly configured');
      assert.equal(syncedRules[0].date_control_duration_minutes, 60); // assignment
      assert.equal(syncedRules[1].date_control_duration_minutes, 90); // group
    });
  });

  describe('Validation and errors', () => {
    it('records an error for invalid date formats', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          releaseDate: 'not a valid date',
        },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.writeAndSyncCourseData(courseData);

      // the rule should not be synced because it has validation errors
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 0, 'Rule with invalid date should not be synced');
    });

    it('rejects sync when non-assignment-level rule specifies integrations', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // create an assignment-level rule without integrations
      // and a group-level rule WITH integrations (which should be invalid)
      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRuleWithIntegrations = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
        integrations: {
          prairieTest: {
            exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
          },
        },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRuleWithIntegrations];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      const syncResults = await util.syncCourseData(courseDir);

      assert.equal(syncResults.status, 'complete');
      if (syncResults.status === 'complete') {
        assert.isTrue(
          syncResults.hadJsonErrors,
          'Sync should have JSON errors when non-assignment-level rule specifies integrations',
        );

        const assessment =
          syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
            util.ASSESSMENT_ID
          ];
        assert.isOk(assessment, 'Assessment should exist in courseData');
        assert.isOk(assessment.errors, 'Assessment should have errors');

        assert.isTrue(
          assessment.errors.some((error) =>
            error.includes(
              'integrations can only be specified on assignment-level rules (rules without labels)',
            ),
          ),
          'Should have specific error about integrations on non-assignment-level rule',
        );
      }

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        0,
        'Should not sync any rules when a non-assignment-level rule specifies integrations',
      );
    });

    it('allows assignment-level rule to specify integrations', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // create an assignment-level rule WITH integrations (should be valid)
      // and a group-level rule WITHOUT integrations
      const assignmentRuleWithIntegrations = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
        integrations: {
          prairieTest: {
            exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
          },
        },
      });
      const groupRule = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRuleWithIntegrations, groupRule];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        2,
        'Should sync all rules when only assignment-level rule has integrations',
      );
    });
  });

  // TODO: should we make more constants in util.ts for this?
  describe('Multiple assessments', () => {
    it('syncs access control for multiple assessments independently', async () => {
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
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2.accessControl = [rule2];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules1 = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      const syncedRules2 = await findSyncedAccessControlRules('test2');

      assert.equal(syncedRules1.length, 1);
      assert.equal(syncedRules1[0].date_control_duration_minutes, 60);

      assert.equal(syncedRules2.length, 1);
      assert.equal(syncedRules2[0].date_control_duration_minutes, 90);
    });
  });

  describe('Round-trip: boolean override fields survive sync and read-back', () => {
    it('preserves afterLastDeadline.allowSubmissions without credit on override', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      const mainRule = makeAccessControlRule({
        dateControl: {
          releaseDate: '2024-03-14T00:01:00',
          dueDate: '2024-03-21T23:59:00',
          afterLastDeadline: { credit: 50, allowSubmissions: true },
        },
      });
      const overrideRule: AccessControlJsonInput = {
        labels: [groupName],
        dateControl: {
          afterLastDeadline: { allowSubmissions: false },
        },
      };

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [mainRule, overrideRule];
      await util.writeAndSyncCourseData(courseData);

      const dbId = await getAssessmentDbId(util.ASSESSMENT_ID);
      const rules = await selectAccessControlRulesForAssessment(dbId);
      const override = rules.find((r) => r.number > 0);
      assert.isOk(override);
      assert.equal(override.rule.dateControl?.afterLastDeadline?.allowSubmissions, false);
    });

    it('preserves hideQuestions without hideQuestionsAgainDate on override', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      const mainRule = makeAccessControlRule();
      const overrideRule: AccessControlJsonInput = {
        labels: [groupName],
        afterComplete: { hideQuestions: true },
      };

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [mainRule, overrideRule];
      await util.writeAndSyncCourseData(courseData);

      const dbId = await getAssessmentDbId(util.ASSESSMENT_ID);
      const rules = await selectAccessControlRulesForAssessment(dbId);
      const override = rules.find((r) => r.number > 0);
      assert.isOk(override);
      assert.equal(override.rule.afterComplete?.hideQuestions, true);
    });

    it('preserves hideScore without showScoreAgainDate on override', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      const mainRule = makeAccessControlRule();
      const overrideRule: AccessControlJsonInput = {
        labels: [groupName],
        afterComplete: { hideScore: true },
      };

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [mainRule, overrideRule];
      await util.writeAndSyncCourseData(courseData);

      const dbId = await getAssessmentDbId(util.ASSESSMENT_ID);
      const rules = await selectAccessControlRulesForAssessment(dbId);
      const override = rules.find((r) => r.number > 0);
      assert.isOk(override);
      assert.equal(override.rule.afterComplete?.hideScore, true);
    });
  });
});
