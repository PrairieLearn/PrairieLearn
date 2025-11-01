/* eslint-disable @typescript-eslint/dot-notation */
import { v4 as uuidv4 } from 'uuid';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { execute, queryRow } from '@prairielearn/postgres';

import {
  AccessControlEarlyDeadlineSchema,
  AccessControlLateDeadlineSchema,
  AccessControlSchema,
  AccessControlTargetSchema,
  AssessmentSchema,
  CourseInstanceSchema,
  IdSchema,
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
      releaseDate: '2024-03-14T00:01:00Z',
      dueDate: '2024-03-21T23:59:00Z',
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

  const allRules = await util.dumpTableWithSchema('access_control', AccessControlSchema);
  return allRules.filter((rule) => idsEqual(rule.assessment_id, assessment.id));
}

/**
 * Helper to create an access control group for testing group-level rules.
 */
async function createAccessControlGroup(courseInstanceId: string, groupUuid: string) {
  const syncedCourseInstances = await util.dumpTableWithSchema(
    'course_instances',
    CourseInstanceSchema,
  );
  const courseInstance = syncedCourseInstances.find((ci) => ci.short_name === courseInstanceId);
  assert.isOk(courseInstance);

  await execute(
    'INSERT INTO access_control_groups (uuid, name, course_instance_id) VALUES ($1, $2, $3)',
    [groupUuid, 'Test Group', courseInstance.id],
  );
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
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [newRule]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].order, 1);
      assert.equal(syncedRules[0].date_control_release_date_overridden, true);

      // check assignment-level target was created
      const targets = await util.dumpTableWithSchema(
        'access_control_target',
        AccessControlTargetSchema,
      );
      assert.equal(targets.length, 1);
      assert.equal(targets[0].target_type, 'assessment');
    });

    // remove assignment level access rules
    it('removes an access control rule', async () => {
      const courseData = util.getCourseData();

      // add access rule
      const rule = makeAccessControlRule();
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

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
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [newRule]);

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
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // update rule
      rule.dateControl!.durationMinutes = 90;
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

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
          dueDate: '2024-03-21T23:59:00Z',
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

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
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

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
          releaseDate: '2024-03-14T00:01:00Z',
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].date_control_release_date_overridden, true);
      assert.equal(
        new Date(syncedRules[0].date_control_release_date!).toISOString(),
        '2024-03-14T00:01:00.000Z',
      );
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
            { date: '2024-03-17T23:59:00Z', credit: 120 },
            { date: '2024-03-20T23:59:00Z', credit: 110 },
          ],
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules[0].date_control_early_deadlines_overridden, true);

      const allDeadlines = await util.dumpTableWithSchema(
        'access_control_early_deadline',
        AccessControlEarlyDeadlineSchema,
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
            { date: '2024-03-23T23:59:00Z', credit: 80 },
            { date: '2024-03-30T23:59:00Z', credit: 50 },
          ],
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules[0].date_control_late_deadlines_overridden, true);

      const allDeadlines = await util.dumpTableWithSchema(
        'access_control_late_deadline',
        AccessControlLateDeadlineSchema,
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
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules[0].date_control_late_deadlines_overridden, true);

      const allDeadlines = await util.dumpTableWithSchema(
        'access_control_late_deadline',
        AccessControlLateDeadlineSchema,
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
          lateDeadlines: [{ date: '2024-03-23T23:59:00Z', credit: 80 }],
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // sync
      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      const allInitialDeadlines = await util.dumpTableWithSchema(
        'access_control_late_deadline',
        AccessControlLateDeadlineSchema,
      );
      const initialDeadlines = allInitialDeadlines.filter((d) =>
        idsEqual(d.access_control_id, initialRules[0].id),
      );
      assert.equal(initialDeadlines.length, 1);

      // remove late deadline
      rule.dateControl!.lateDeadlines = [];
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      const allSyncedDeadlines = await util.dumpTableWithSchema(
        'access_control_late_deadline',
        AccessControlLateDeadlineSchema,
      );

      // check if the new deadlines array is empty
      const syncedDeadlines = allSyncedDeadlines.filter((d) =>
        idsEqual(d.access_control_id, syncedRules[0].id),
      );
      assert.equal(syncedDeadlines.length, 0);
    });
  });

  // Validates order column behaviour is correct
  describe('Order management', () => {
    // Verifies that multiple access control rules are assigned sequential
    // order numbers matching the order they were specified in the JSON array
    it('assigns correct order to multiple rules', async () => {
      const courseData = util.getCourseData();
      const groupUuid1 = uuidv4();
      const groupUuid2 = uuidv4();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // create groups
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid1);
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid2);

      // create 1 assignment-level rule and 2 group-level rules
      const rule1 = makeAccessControlRule({
        dateControl: { releaseDate: '2024-03-14T00:01:00Z', durationMinutes: 60 },
      });
      const rule2 = makeAccessControlRule({
        targets: [groupUuid1],
        dateControl: { durationMinutes: 90 },
      });
      const rule3 = makeAccessControlRule({
        targets: [groupUuid2],
        dateControl: { durationMinutes: 120 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule1, rule2, rule3]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 3);

      // sort for stable ordering
      syncedRules.sort((a, b) => a.order - b.order);

      // check each rule is in the correct order
      assert.equal(syncedRules[0].order, 1);
      assert.equal(syncedRules[0].date_control_duration_minutes, 60);
      assert.isNotNull(syncedRules[0].date_control_release_date);

      assert.equal(syncedRules[1].order, 2);
      assert.equal(syncedRules[1].date_control_duration_minutes, 90);
      assert.isNull(syncedRules[1].date_control_release_date);

      assert.equal(syncedRules[2].order, 3);
      assert.equal(syncedRules[2].date_control_duration_minutes, 120);
      assert.isNull(syncedRules[2].date_control_release_date);
    });

    // Validate that when rules are updated, their order numbers and
    // corresponding properties remain in the same sequence as specified
    it('maintains order when rules are updated', async () => {
      const courseData = util.getCourseData();
      const groupUuid = uuidv4();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // Create group
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid);

      // create 1 assignment-level rule and 1 group-level rule
      const rule1 = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
      const rule2 = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule1, rule2]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // update first rule
      rule1.dateControl!.durationMinutes = 75;
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule1, rule2]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      syncedRules.sort((a, b) => a.order - b.order);
      assert.equal(syncedRules.length, 2);

      // verify the updated rule1 is still at order 1
      assert.equal(syncedRules[0].order, 1);
      assert.equal(syncedRules[0].date_control_duration_minutes, 75);

      // verify rule2 is still at order 2
      assert.equal(syncedRules[1].order, 2);
      assert.equal(syncedRules[1].date_control_duration_minutes, 90);
    });

    // Validates that when syncing fewer rules than previously existed,
    // the remaining rules maintain the correct order and properties
    it('deletes excess rules when syncing fewer rules', async () => {
      const courseData = util.getCourseData();
      const groupUuid1 = uuidv4();
      const groupUuid2 = uuidv4();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // Create groups
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid1);
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid2);

      // create 1 assignment-level rule and 2 group-level rules
      const rule1 = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
      const rule2 = makeAccessControlRule({
        targets: [groupUuid1],
        dateControl: { durationMinutes: 90 },
      });
      const rule3 = makeAccessControlRule({
        targets: [groupUuid2],
        dateControl: { durationMinutes: 120 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule1, rule2, rule3]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // validate 3 rules were created
      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(initialRules.length, 3);

      // sync with only the assignment-level rule
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule1]);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);

      // verify it's the correct rule with the correct order
      assert.equal(syncedRules[0].order, 1);
      assert.equal(syncedRules[0].date_control_duration_minutes, 60);
    });

    // Validate reordering rules works in the database
    it('respects rule order when rules are reordered', async () => {
      const courseData = util.getCourseData();
      const groupUuid = uuidv4();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // Create group
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid);

      const rule1 = makeAccessControlRule({ dateControl: { durationMinutes: 60 } });
      const rule2 = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule1, rule2]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify initial order
      const initialRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      initialRules.sort((a, b) => a.order - b.order);
      assert.equal(initialRules[0].date_control_duration_minutes, 60);
      assert.equal(initialRules[1].date_control_duration_minutes, 90);

      // reverse the order in JSON
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule2, rule1]);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify the order was reversed in the database
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      syncedRules.sort((a, b) => a.order - b.order);
      assert.equal(syncedRules.length, 2);
      assert.equal(syncedRules[0].order, 1);
      assert.equal(syncedRules[0].date_control_duration_minutes, 90);
      assert.equal(syncedRules[1].order, 2);
      assert.equal(syncedRules[1].date_control_duration_minutes, 60);
    });
  });

  describe('Individual-level rule precedence', () => {
    // Verifies that individual-level rules maintain higher precedence
    // than assignment/group-level rules  and that order numbers
    // automatically shift when group rules experience a change
    it('shifts individual rule orders when group rules change', async () => {
      const courseData = util.getCourseData();
      const groupUuid1 = uuidv4();
      const groupUuid2 = uuidv4();

      // create one assessment rule and two group rules
      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule1 = makeAccessControlRule({
        targets: [groupUuid1],
        dateControl: { durationMinutes: 90 },
      });
      const groupRule2 = makeAccessControlRule({
        targets: [groupUuid2],
        dateControl: { durationMinutes: 120 },
      });

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // Create access control groups
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid1);
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid2);

      // sync
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [
        assignmentRule,
        groupRule1,
        groupRule2,
      ]);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
      const assessment = syncedAssessments.find(
        (a) => a.tid === util.ASSESSMENT_ID && a.deleted_at == null,
      );
      assert.isOk(assessment);

      // validate initial state: 3 rules with orders 1, 2, 3
      let allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => a.order - b.order);
      assert.equal(allRules.length, 3);
      assert.equal(allRules[0].order, 1);
      assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment
      assert.equal(allRules[1].order, 2);
      assert.equal(allRules[1].date_control_duration_minutes, 90); // group1
      assert.equal(allRules[2].order, 3);
      assert.equal(allRules[2].date_control_duration_minutes, 120); // group2

      // manually create 2 individual-level rules (UI creation)
      const user1Id = await queryRow(
        'INSERT INTO users (uid, name, institution_id) VALUES ($1, $2, $3) RETURNING user_id',
        ['user1@example.com', 'User 1', '1'],
        IdSchema,
      );

      const user2Id = await queryRow(
        'INSERT INTO users (uid, name, institution_id) VALUES ($1, $2, $3) RETURNING user_id',
        ['user2@example.com', 'User 2', '1'],
        IdSchema,
      );

      const individualRule1Id = await queryRow(
        `INSERT INTO access_control (
    course_instance_id, assessment_id, enabled, block_access, 
    list_before_release, "order", date_control_duration_minutes,
    date_control_duration_minutes_overridden
  ) VALUES ($1, $2, true, false, true, 4, 150, true) RETURNING id`,
        [assessment.course_instance_id, assessment.id],
        IdSchema,
      );

      const individualRule2Id = await queryRow(
        `INSERT INTO access_control (
    course_instance_id, assessment_id, enabled, block_access,
    list_before_release, "order", date_control_duration_minutes,
    date_control_duration_minutes_overridden
  ) VALUES ($1, $2, true, false, true, 5, 180, true) RETURNING id`,
        [assessment.course_instance_id, assessment.id],
        IdSchema,
      );

      // create targets
      await execute(
        'INSERT INTO access_control_target (access_control_id, target_type, target_id) VALUES ($1, $2, $3)',
        [individualRule1Id, 'individual', user1Id],
      );
      await execute(
        'INSERT INTO access_control_target (access_control_id, target_type, target_id) VALUES ($1, $2, $3)',
        [individualRule2Id, 'individual', user2Id],
      );

      // validate we now have 5 rules with correct orders
      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => a.order - b.order);
      assert.equal(allRules.length, 5);
      assert.equal(allRules[0].order, 1); // assignment
      assert.equal(allRules[1].order, 2); // group1
      assert.equal(allRules[2].order, 3); // group2
      assert.equal(allRules[3].order, 4); // individual1
      assert.equal(allRules[3].date_control_duration_minutes, 150);
      assert.equal(allRules[4].order, 5); // individual2
      assert.equal(allRules[4].date_control_duration_minutes, 180);

      // remove one group rule and resync
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [assignmentRule, groupRule1]);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify individual rules shifted down (orders 3, 4 instead of 4, 5)
      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => a.order - b.order);
      assert.equal(allRules.length, 4);
      assert.equal(allRules[0].order, 1); // assignment
      assert.equal(allRules[0].date_control_duration_minutes, 60);
      assert.equal(allRules[1].order, 2); // group1
      assert.equal(allRules[1].date_control_duration_minutes, 90);
      assert.equal(allRules[2].order, 3); // individual1
      assert.equal(allRules[2].date_control_duration_minutes, 150);
      assert.equal(allRules[3].order, 4); // individual2
      assert.equal(allRules[3].date_control_duration_minutes, 180);

      // verify the individual rules still have individual targets
      const allTargets = await util.dumpTableWithSchema(
        'access_control_target',
        AccessControlTargetSchema,
      );
      const individualTargets = allTargets.filter(
        (t) =>
          t.target_type === 'individual' &&
          (idsEqual(t.access_control_id, allRules[2].id) ||
            idsEqual(t.access_control_id, allRules[3].id)),
      );
      assert.equal(individualTargets.length, 2);

      // add a group rule back and resync
      const groupRule3 = makeAccessControlRule({
        targets: [groupUuid2], // reusing groupUuid2
        dateControl: { durationMinutes: 135 },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [
        assignmentRule,
        groupRule1,
        groupRule3,
      ]);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify individual rules shifted up (back to orders 4, 5)
      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => a.order - b.order);
      assert.equal(allRules.length, 5);
      assert.equal(allRules[0].order, 1); // assignment
      assert.equal(allRules[0].date_control_duration_minutes, 60);
      assert.equal(allRules[1].order, 2); // group1
      assert.equal(allRules[1].date_control_duration_minutes, 90);
      assert.equal(allRules[2].order, 3); // group3 (new)
      assert.equal(allRules[2].date_control_duration_minutes, 135);
      assert.equal(allRules[3].order, 4); // individual1
      assert.equal(allRules[3].date_control_duration_minutes, 150);
      assert.equal(allRules[4].order, 5); // individual2
      assert.equal(allRules[4].date_control_duration_minutes, 180);

      // verify individual rules still preserved
      const finalTargets = allTargets.filter(
        (t) =>
          t.target_type === 'individual' &&
          (idsEqual(t.access_control_id, allRules[3].id) ||
            idsEqual(t.access_control_id, allRules[4].id)),
      );
      assert.equal(finalTargets.length, 2);
    });

    // validate that when group rules are removed, individual-level
    // rules shift down appropriately (but are not deleted)
    it('shifts individual rules when group rules are removed', async () => {
      const courseData = util.getCourseData();
      const groupUuid = uuidv4();

      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
      });

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid);

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [assignmentRule, groupRule]);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
      const assessment = syncedAssessments.find(
        (a) => a.tid === util.ASSESSMENT_ID && a.deleted_at == null,
      );
      assert.isOk(assessment);

      // Create an individual-level rule
      const userId = await queryRow(
        'INSERT INTO users (uid, name, institution_id) VALUES ($1, $2, $3) RETURNING user_id',
        ['user@example.com', 'Test User', '1'],
        IdSchema,
      );

      const individualRuleId = await queryRow(
        `INSERT INTO access_control (
  course_instance_id, assessment_id, enabled, block_access,
  list_before_release, "order", date_control_duration_minutes,
  date_control_duration_minutes_overridden
) VALUES ($1, $2, true, false, true, 3, 150, true) RETURNING id`,
        [assessment.course_instance_id, assessment.id],
        IdSchema,
      );

      await execute(
        'INSERT INTO access_control_target (access_control_id, target_type, target_id) VALUES ($1, $2, $3)',
        [individualRuleId, 'individual', userId],
      );

      // Verify initial state: assignment (order 1), group (order 2), individual (order 3)
      let allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => a.order - b.order);
      assert.equal(allRules.length, 3);
      assert.equal(allRules[0].order, 1);
      assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment
      assert.equal(allRules[1].order, 2);
      assert.equal(allRules[1].date_control_duration_minutes, 90); // group
      assert.equal(allRules[2].order, 3);
      assert.equal(allRules[2].date_control_duration_minutes, 150); // individual

      // Remove the group rule by syncing with only the assignment rule
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [assignmentRule]);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // verify the group rule was deleted and individual rule shifted to order 2
      allRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      allRules.sort((a, b) => a.order - b.order);
      assert.equal(allRules.length, 2);
      assert.equal(allRules[0].order, 1);
      assert.equal(allRules[0].date_control_duration_minutes, 60); // assignment rule
      assert.equal(allRules[1].order, 2);
      assert.equal(allRules[1].date_control_duration_minutes, 150); // individual rule

      // verify it's still an individual rule
      const allTargets = await util.dumpTableWithSchema(
        'access_control_target',
        AccessControlTargetSchema,
      );
      const individualTarget = allTargets.find((t) =>
        idsEqual(t.access_control_id, allRules[1].id),
      );
      assert.isOk(individualTarget);
      assert.equal(individualTarget.target_type, 'individual');
    });
  });

  describe('After complete settings', () => {
    it('syncs hideQuestions settings', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        afterComplete: {
          hideQuestions: true,
          hideQuestionsDateControl: {
            showAgainDate: '2024-03-23T23:59:00Z',
          },
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].after_complete_hide_questions, true);
      assert.equal(syncedRules[0].after_complete_hide_questions_show_again_date_overridden, true);
      assert.isNotNull(syncedRules[0].after_complete_hide_questions_show_again_date);
    });

    it('syncs hideScore settings', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        afterComplete: {
          hideScore: true,
          hideScoreDateControl: {
            showAgainDate: '2024-03-25T23:59:00Z',
          },
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 1);
      assert.equal(syncedRules[0].after_complete_hide_score, true);
      assert.equal(syncedRules[0].after_complete_hide_score_show_again_date_overridden, true);
      assert.isNotNull(syncedRules[0].after_complete_hide_score_show_again_date);
    });
  });

  describe('Group-level rules', () => {
    it('syncs group-level access control rules', async () => {
      const courseData = util.getCourseData();
      const groupUuid = uuidv4();

      // Create the group first
      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid);

      // Now add an assignment-level rule and a group-level rule
      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [assignmentRule, groupRule]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 2);

      // Verify group target was created
      const allTargets = await util.dumpTableWithSchema(
        'access_control_target',
        AccessControlTargetSchema,
      );
      const groupTargets = allTargets.filter(
        (t) => t.target_type === 'group' && idsEqual(t.access_control_id, syncedRules[1].id),
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
        targets: ['nonexistent-group-uuid'],
        dateControl: { durationMinutes: 90 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [
        assignmentRule,
        ruleWithInvalidTarget,
      ]);

      await util.writeAndSyncCourseData(courseData);

      // No rules should be synced because one has an invalid group target
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(
        syncedRules.length,
        0,
        'Should not sync any rules when there are invalid group targets',
      );
    });
  });

  describe('Assignment-level rule requirement', () => {
    it('rejects sync when no assignment-level rule exists', async () => {
      const courseData = util.getCourseData();
      const groupUuid = uuidv4();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // create group
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid);

      // try to create only group-level rules (no assignment-level)
      const groupRule = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [groupRule]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

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

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule1, rule2]);

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
      const groupUuid = uuidv4();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // create group
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid);

      // create one assignment-level rule and one group-level rule
      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [assignmentRule, groupRule]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      // validate both rules were synced successfully
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 2, 'Should sync all rules when properly configured');

      syncedRules.sort((a, b) => a.order - b.order);
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
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      // the rule should not be synced because it has validation errors
      const syncedRules = await findSyncedAccessControlRules(util.ASSESSMENT_ID);
      assert.equal(syncedRules.length, 0, 'Rule with invalid date should not be synced');
    });

    it('rejects sync when non-assignment-level rule specifies prairieTestControl', async () => {
      const courseData = util.getCourseData();
      const groupUuid = uuidv4();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // create group
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid);

      // create an assignment-level rule without prairieTestControl
      // and a group-level rule WITH prairieTestControl (which should be invalid)
      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRuleWithPrairieTest = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
        prairieTestControl: {
          exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
        },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [
        assignmentRule,
        groupRuleWithPrairieTest,
      ]);

      await util.writeCourseToDirectory(courseData, courseDir);
      const syncResults = await util.syncCourseData(courseDir);

      // verify that sync failed with errors
      assert.equal(syncResults.status, 'complete');
      if (syncResults.status === 'complete') {
        assert.isTrue(
          syncResults.hadJsonErrors,
          'Sync should have JSON errors when non-assignment-level rule specifies prairieTestControl',
        );

        // verify the specific error message
        const accessControlRules =
          syncResults.courseData.courseInstances[util.COURSE_INSTANCE_ID].assessmentAccessControl?.[
            util.ASSESSMENT_ID
          ];
        assert.isOk(accessControlRules, 'Access control rules should exist in courseData');

        // second rule (index 1) is the group-level rule with prairieTestControl
        const groupRuleErrors = accessControlRules[1].errors;
        assert.isTrue(
          groupRuleErrors.some((error) =>
            error.includes(
              'Only the assignment-level rule (without targets) is allowed to specify prairieTestControl',
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
      const groupUuid = uuidv4();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // create group
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid);

      // create an assignment-level rule WITH prairieTestControl (should be valid)
      // and a group-level rule WITHOUT prairieTestControl
      const assignmentRuleWithPrairieTest = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
        prairieTestControl: {
          exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' }],
        },
      });
      const groupRule = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [
        assignmentRuleWithPrairieTest,
        groupRule,
      ]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

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
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['test2'] = {
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

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule1]);
      util.setAccessControlRules(courseData, 'test2', [rule2]);

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
