import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { execute, queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  AssessmentAccessControlEarlyDeadlineSchema,
  AssessmentAccessControlEnrollmentSchema,
  AssessmentAccessControlLateDeadlineSchema,
  AssessmentAccessControlSchema,
  AssessmentAccessControlStudentLabelSchema,
  AssessmentSchema,
  CourseInstanceSchema,
} from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { type AccessControlJsonInput } from '../../schemas/accessControl.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

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

/**
 * Helper to find synced access control rules for an assessment.
 */
async function findSyncedAccessControlRules(assessmentId: string) {
  const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
  const assessment = syncedAssessments.find((a) => a.tid === assessmentId && a.deleted_at == null);
  assert.isOk(assessment);

  const allRules = await util.dumpTableWithSchema(
    'assessment_access_control',
    AssessmentAccessControlSchema,
  );
  return allRules.filter((rule) => idsEqual(rule.assessment_id, assessment.id));
}

/**
 * Helper to add a student group to the course instance JSON configuration.
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
  ci.courseInstance.studentLabels.push({ name: groupName, color: 'blue1' });
}

describe('Access control syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  // Validate new assignment-level access control rule (i.e. target is undefined) syncs correctly
  describe('Basic rule syncing', () => {
    it('adds a new assignment-level access control rule', async () => {
      const { courseData, courseDir } = await util.createAndSyncCourseData();

      // add assignment-level access control rule
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

    // remove assignment level access rules
    it('removes an access control rule', async () => {
      const courseData = util.getCourseData();

      // add access rule
      const rule = makeAccessControlRule();
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // verify rule was created
      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(initialRules.length, 1);

      // remove the rule - but we need at least one assignment-level rule
      // So we'll replace it with a different one
      const newRule = makeAccessControlRule({
        dateControl: { durationMinutes: 45 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [newRule];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // check the old rule was replaced with the new one
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].date_control_duration_minutes, 45);
    });

    it('updates an existing access control rule', async () => {
      const courseData = util.getCourseData();

      // create access rule
      const rule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // update rule
      rule.dateControl!.durationMinutes = 90;
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // checked that preexisting rule was updated
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].date_control_duration_minutes, 90);
    });
  });

  // Validates JSON -> DB representation of overrides
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

  // Validates that fields that map to join tables write to those tables
  describe('Deadline handling', () => {
    // AccessControlEarlyDeadlines
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
        idsEqual(d.access_control_id, syncedRules[0].id),
      );
      assert.equal(deadlines.length, 2);
      assert.equal(deadlines[0].credit, 120);
      assert.equal(deadlines[1].credit, 110);
    });

    // AccessControlLateDeadlines
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
        idsEqual(d.access_control_id, syncedRules[0].id),
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
        idsEqual(d.access_control_id, syncedRules[0].id),
      );
      assert.equal(deadlines.length, 0);
    });

    it('removes deadlines when rule is updated', async () => {
      const courseData = util.getCourseData();

      // create access control with lateDeadline
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

      // sync
      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      const allInitialDeadlines = await util.dumpTableWithSchema(
        'assessment_access_control_late_deadline',
        AssessmentAccessControlLateDeadlineSchema,
      );
      const initialDeadlines = allInitialDeadlines.filter((d) =>
        idsEqual(d.access_control_id, initialRules[0].id),
      );
      assert.equal(initialDeadlines.length, 1);

      // remove late deadline
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

      // check if the new deadlines array is empty
      const syncedDeadlines = allSyncedDeadlines.filter((d) =>
        idsEqual(d.access_control_id, syncedRules[0].id),
      );
      assert.equal(syncedDeadlines.length, 0);
    });
  });

  // Validates number column behaviour is correct
  describe('Order management', () => {
    // Verifies that multiple access control rules are assigned sequential
    // number numbers matching the number they were specified in the JSON array
    it('assigns correct number to multiple rules', async () => {
      const courseData = util.getCourseData();
      const groupName1 = 'Group A';
      const groupName2 = 'Group B';

      // Add student groups to config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName1);
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName2);

      // create 1 assignment-level rule and 2 group-level rules
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

      // sort for stable numbering
      syncedRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

      // check each rule is in the correct number
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

    // Validate that when rules are updated, their number numbers and
    // corresponding properties remain in the same sequence as specified
    it('maintains number when rules are updated', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      // Add student group to config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // create 1 assignment-level rule and 1 group-level rule
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

      // update first rule
      rule1.dateControl!.durationMinutes = 75;
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1, rule2];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      syncedRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      assert.equal(syncedRules.length, 2);

      // verify the updated rule1 is still at number 0
      assert.equal(syncedRules[0].number, 0);
      assert.equal(syncedRules[0].date_control_duration_minutes, 75);

      // verify rule2 is still at number 1
      assert.equal(syncedRules[1].number, 1);
      assert.equal(syncedRules[1].date_control_duration_minutes, 90);
    });

    // Validates that when syncing fewer rules than previously existed,
    // the remaining rules maintain the correct number and properties
    it('deletes excess rules when syncing fewer rules', async () => {
      const courseData = util.getCourseData();
      const groupName1 = 'Group A';
      const groupName2 = 'Group B';

      // Add student groups to config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName1);
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName2);

      // create 1 assignment-level rule and 2 group-level rules
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

      // validate 3 rules were created
      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(initialRules.length, 3);

      // sync with only the assignment-level rule
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);

      // verify it's the correct rule with the correct number
      assert.equal(syncedRules[0].number, 0);
      assert.equal(syncedRules[0].date_control_duration_minutes, 60);
    });

    // Validate renumbering group rules works in the database
    // Note: The assignment-level rule (target_type='none') must remain at position 0
    it('respects rule number when group rules are renumbered', async () => {
      const courseData = util.getCourseData();
      const groupName1 = 'Group A';
      const groupName2 = 'Group B';

      // Add student groups to config
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

      // verify initial order: assignment (0), group1 (1), group2 (2)
      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      initialRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      assert.equal(initialRules[0].date_control_duration_minutes, 60);
      assert.equal(initialRules[1].date_control_duration_minutes, 90);
      assert.equal(initialRules[2].date_control_duration_minutes, 120);

      // swap the group rules: [assignment, group2, group1]
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule2, groupRule1];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify the group rules were swapped in the database
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      syncedRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
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
    // Verifies that enrollment-level rules (at 100+) are preserved
    // when JSON rules (0-99) are modified
    it('preserves enrollment rules when group rules change', async () => {
      const courseData = util.getCourseData();
      const groupName1 = 'Group A';
      const groupName2 = 'Group B';

      // Add student groups to config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName1);
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName2);

      // create one assessment rule and two group rules
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

      // validate initial state: 3 rules with numbers 0, 1, 2
      let allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      assert.equal(allRules.length, 3);
      assert.equal(allRules[0].number, 0);
      assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment
      assert.equal(allRules[1].number, 1);
      assert.equal(allRules[1].date_control_duration_minutes, 90); // group1
      assert.equal(allRules[2].number, 2);
      assert.equal(allRules[2].date_control_duration_minutes, 120); // group2

      // manually create 2 enrollment-level rules (UI creation) at numbers 100+
      const user1Id = await queryRow(
        'INSERT INTO users (uid, name, institution_id) VALUES ($1, $2, $3) RETURNING id',
        ['user1@example.com', 'User 1', '1'],
        IdSchema,
      );

      const user2Id = await queryRow(
        'INSERT INTO users (uid, name, institution_id) VALUES ($1, $2, $3) RETURNING id',
        ['user2@example.com', 'User 2', '1'],
        IdSchema,
      );

      // Create enrollments for the users
      const enrollment1Id = await queryRow(
        'INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
        [user1Id, assessment.course_instance_id, 'joined'],
        IdSchema,
      );

      const enrollment2Id = await queryRow(
        'INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
        [user2Id, assessment.course_instance_id, 'joined'],
        IdSchema,
      );

      const enrollmentRule1Id = await queryRow(
        `INSERT INTO assessment_access_control (
    course_instance_id, assessment_id, enabled, block_access,
    list_before_release, "number", target_type, date_control_duration_minutes,
    date_control_duration_minutes_overridden
  ) VALUES ($1, $2, true, false, true, 100, 'enrollment', 150, true) RETURNING id`,
        [assessment.course_instance_id, assessment.id],
        IdSchema,
      );

      const enrollmentRule2Id = await queryRow(
        `INSERT INTO assessment_access_control (
    course_instance_id, assessment_id, enabled, block_access,
    list_before_release, "number", target_type, date_control_duration_minutes,
    date_control_duration_minutes_overridden
  ) VALUES ($1, $2, true, false, true, 101, 'enrollment', 180, true) RETURNING id`,
        [assessment.course_instance_id, assessment.id],
        IdSchema,
      );

      // create enrollment targets
      await execute(
        'INSERT INTO assessment_access_control_enrollments (assessment_access_control_id, enrollment_id) VALUES ($1, $2)',
        [enrollmentRule1Id, enrollment1Id],
      );
      await execute(
        'INSERT INTO assessment_access_control_enrollments (assessment_access_control_id, enrollment_id) VALUES ($1, $2)',
        [enrollmentRule2Id, enrollment2Id],
      );

      // validate we now have 5 rules
      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      assert.equal(allRules.length, 5);
      assert.equal(allRules[0].number, 0); // assignment
      assert.equal(allRules[1].number, 1); // group1
      assert.equal(allRules[2].number, 2); // group2
      assert.equal(allRules[3].number, 100); // enrollment1
      assert.equal(allRules[3].date_control_duration_minutes, 150);
      assert.equal(allRules[4].number, 101); // enrollment2
      assert.equal(allRules[4].date_control_duration_minutes, 180);

      // remove one group rule and resync
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule1];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify enrollment rules are preserved (still at 100, 101)
      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      assert.equal(allRules.length, 4);
      assert.equal(allRules[0].number, 0); // assignment
      assert.equal(allRules[0].date_control_duration_minutes, 60);
      assert.equal(allRules[1].number, 1); // group1
      assert.equal(allRules[1].date_control_duration_minutes, 90);
      assert.equal(allRules[2].number, 100); // enrollment1
      assert.equal(allRules[2].date_control_duration_minutes, 150);
      assert.equal(allRules[3].number, 101); // enrollment2
      assert.equal(allRules[3].date_control_duration_minutes, 180);

      // verify the enrollment rules still have enrollment targets
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

      // add a group rule back and resync
      const groupRule3 = makeAccessControlRule({
        labels: [groupName2], // reusing groupName2
        dateControl: { durationMinutes: 135 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRule1, groupRule3];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify enrollment rules are still preserved
      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      assert.equal(allRules.length, 5);
      assert.equal(allRules[0].number, 0); // assignment
      assert.equal(allRules[0].date_control_duration_minutes, 60);
      assert.equal(allRules[1].number, 1); // group1
      assert.equal(allRules[1].date_control_duration_minutes, 90);
      assert.equal(allRules[2].number, 2); // group3 (new)
      assert.equal(allRules[2].date_control_duration_minutes, 135);
      assert.equal(allRules[3].number, 100); // enrollment1
      assert.equal(allRules[3].date_control_duration_minutes, 150);
      assert.equal(allRules[4].number, 101); // enrollment2
      assert.equal(allRules[4].date_control_duration_minutes, 180);

      // verify enrollment rules still preserved
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

    // validate that enrollment-level rules (at 100+) are preserved
    // when JSON rules change
    it('preserves enrollment rules when group rules are removed', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      // Add student group to config
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

      // Create an enrollment-level rule at number 100+
      const userId = await queryRow(
        'INSERT INTO users (uid, name, institution_id) VALUES ($1, $2, $3) RETURNING id',
        ['user@example.com', 'Test User', '1'],
        IdSchema,
      );

      const enrollmentId = await queryRow(
        'INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
        [userId, assessment.course_instance_id, 'joined'],
        IdSchema,
      );

      const enrollmentRuleId = await queryRow(
        `INSERT INTO assessment_access_control (
  course_instance_id, assessment_id, enabled, block_access,
  list_before_release, "number", target_type, date_control_duration_minutes,
  date_control_duration_minutes_overridden
) VALUES ($1, $2, true, false, true, 100, 'enrollment', 150, true) RETURNING id`,
        [assessment.course_instance_id, assessment.id],
        IdSchema,
      );

      await execute(
        'INSERT INTO assessment_access_control_enrollments (assessment_access_control_id, enrollment_id) VALUES ($1, $2)',
        [enrollmentRuleId, enrollmentId],
      );

      // Verify initial state: assignment (number 0), group (number 1), enrollment (number 100)
      let allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      assert.equal(allRules.length, 3);
      assert.equal(allRules[0].number, 0);
      assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment
      assert.equal(allRules[1].number, 1);
      assert.equal(allRules[1].date_control_duration_minutes, 90); // group
      assert.equal(allRules[2].number, 100);
      assert.equal(allRules[2].date_control_duration_minutes, 150); // enrollment

      // Remove the group rule by syncing with only the assignment rule
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify the group rule was deleted but enrollment rule preserved at 100
      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      assert.equal(allRules.length, 2);
      assert.equal(allRules[0].number, 0);
      assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment rule
      assert.equal(allRules[1].number, 100);
      assert.equal(allRules[1].date_control_duration_minutes, 150); // enrollment rule

      // verify it's still an enrollment rule
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

      // Add student group to course instance config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // Add an assignment-level rule and a group-level rule
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

      // Verify student group target was created
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

      // Create an assignment-level rule and a rule with invalid group targets
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

      await util.writeAndSyncCourseData(courseData);

      // No rules should be synced because one has an invalid group target
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

      // Add student group to config so it exists in DB after sync
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // Sync the course to get the assessment and student group in the database
      await util.writeAndSyncCourseData(courseData);

      const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
      const assessment = syncedAssessments.find(
        (a) => a.tid === util.ASSESSMENT_ID && a.deleted_at == null,
      );
      assert.isOk(assessment);

      // Create a user and enrollment
      const userId = await queryRow(
        'INSERT INTO users (uid, name, institution_id) VALUES ($1, $2, $3) RETURNING id',
        ['user@example.com', 'Test User', '1'],
        IdSchema,
      );

      const enrollmentId = await queryRow(
        'INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
        [userId, assessment.course_instance_id, 'joined'],
        IdSchema,
      );

      // Create an access control rule with target_type='enrollment' (must use number > 0)
      const ruleId = await queryRow(
        `INSERT INTO assessment_access_control (
          course_instance_id, assessment_id, enabled, block_access,
          list_before_release, "number", target_type
        ) VALUES ($1, $2, true, false, true, 100, 'enrollment') RETURNING id`,
        [assessment.course_instance_id, assessment.id],
        IdSchema,
      );

      // Add an enrollment (should succeed)
      await execute(
        'INSERT INTO assessment_access_control_enrollments (assessment_access_control_id, enrollment_id) VALUES ($1, $2)',
        [ruleId, enrollmentId],
      );

      // Get the student group ID
      const syncedCourseInstances = await util.dumpTableWithSchema(
        'course_instances',
        CourseInstanceSchema,
      );
      const courseInstance = syncedCourseInstances.find(
        (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
      );
      assert.isOk(courseInstance);

      const studentLabelId = await queryRow(
        'SELECT id FROM student_labels WHERE name = $1 AND course_instance_id = $2',
        [groupName, courseInstance.id],
        IdSchema,
      );

      // Try to add a student group to the same rule (should fail due to FK constraint)
      // The parent rule has target_type='enrollment', but the student_labels table
      // requires target_type='student_label', so the FK constraint will fail
      let errorThrown = false;
      try {
        await execute(
          'INSERT INTO assessment_access_control_student_labels (assessment_access_control_id, student_label_id) VALUES ($1, $2)',
          [ruleId, studentLabelId],
        );
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

      // Add student group to config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // try to create only group-level rules (no assignment-level)
      const groupRule = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [groupRule];

      await util.writeAndSyncCourseData(courseData);

      // verify that no rules were synced due to validation error
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        0,
        'Should not sync any rules when there is no assignment-level rule',
      );
    });

    it('rejects sync when multiple assignment-level rules exist', async () => {
      const courseData = util.getCourseData();

      // try to create two assignment-level rules
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

      // verify that no rules were synced due to validation error
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

      // Add student group to config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // create one assignment-level rule and one group-level rule
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

      // validate both rules were synced successfully
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 2, 'Should sync all rules when properly configured');

      syncedRules.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
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

    it('rejects sync when non-assignment-level rule specifies prairieTestControl', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      // Add student group to config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // create an assignment-level rule without prairieTestControl
      // and a group-level rule WITH prairieTestControl (which should be invalid)
      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRuleWithPrairieTest = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
        prairieTestControl: {
          exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
        },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRule, groupRuleWithPrairieTest];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      const syncResults = await util.syncCourseData(courseDir);

      // verify that sync failed with errors
      assert.equal(syncResults.status, 'complete');
      if (syncResults.status === 'complete') {
        assert.isTrue(
          syncResults.hadJsonErrors,
          'Sync should have JSON errors when non-assignment-level rule specifies prairieTestControl',
        );

        // verify the specific error message on the assessment InfoFile
        const assessment =
          syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
            util.ASSESSMENT_ID
          ];
        assert.isOk(assessment, 'Assessment should exist in courseData');
        assert.isOk(assessment.errors, 'Assessment should have errors');

        // The error about prairieTestControl should be on the assessment
        assert.isTrue(
          assessment.errors.some((error) =>
            error.includes(
              'Only the assignment-level rule (without groups) is allowed to specify prairieTestControl',
            ),
          ),
          'Should have specific error about prairieTestControl on non-assignment-level rule',
        );
      }

      // verify that no rules were synced due to validation error
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        0,
        'Should not sync any rules when a non-assignment-level rule specifies prairieTestControl',
      );
    });

    it('allows assignment-level rule to specify prairieTestControl', async () => {
      const courseData = util.getCourseData();
      const groupName = 'Test Group';

      // Add student group to config
      addStudentLabelToConfig(courseData, util.COURSE_INSTANCE_ID, groupName);

      // create an assignment-level rule WITH prairieTestControl (should be valid)
      // and a group-level rule WITHOUT prairieTestControl
      const assignmentRuleWithPrairieTest = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
        prairieTestControl: {
          exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
        },
      });
      const groupRule = makeAccessControlRule({
        labels: [groupName],
        dateControl: { durationMinutes: 90 },
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [assignmentRuleWithPrairieTest, groupRule];

      await util.writeAndSyncCourseData(courseData);

      // verify that both rules were synced successfully
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        2,
        'Should sync all rules when only assignment-level rule has prairieTestControl',
      );
    });
  });

  // TODO: should we make more constants in util.ts for this?
  describe('Multiple assessments', () => {
    it('syncs access control for multiple assessments independently', async () => {
      const courseData = util.getCourseData();

      // add a second assessment
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2 = {
        uuid: '03f3b4d2-0264-48b7-bf42-107732142c02',
        title: 'Test assessment 2',
        type: 'Exam',
        set: 'PRIVATE SET',
        number: '102',
        zones: [],
      };

      // add access control for both assessments
      const rule1 = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
      const rule2 = makeAccessControlRule({ dateControl: { durationMinutes: 90 } });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
        util.ASSESSMENT_ID
      ].accessControl = [rule1];
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.test2.accessControl = [rule2];

      await util.writeAndSyncCourseData(courseData);

      const syncedRules1 = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      const syncedRules2 = await findSyncedAccessControlRules('test2');

      // check both assessments' rules synced
      assert.equal(syncedRules1.length, 1);
      assert.equal(syncedRules1[0].date_control_duration_minutes, 60);

      assert.equal(syncedRules2.length, 1);
      assert.equal(syncedRules2[0].date_control_duration_minutes, 90);
    });
  });
});
