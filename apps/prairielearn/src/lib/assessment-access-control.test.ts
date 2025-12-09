import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { execute } from '@prairielearn/postgres';

import type { AccessControlJsonInput } from '../schemas/accessControl.js';
import * as helperDb from '../tests/helperDb.js';
import * as util from '../tests/sync/util.js';

import { getAccessControlForAssessment } from './assessment-access-control.js';
import { AssessmentSchema, CourseInstanceSchema } from './db-types.js';

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
    blockAccess: false,
    ...overrides,
  };
}

/**
 * Helper to find synced assessment by tid
 */
async function findAssessment(assessmentId: string) {
  const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
  return syncedAssessments.find((a) => a.tid === assessmentId && a.deleted_at == null);
}

/**
 * Helper to create an access control group for testing group-level rules.
 */
async function createAccessControlGroup(
  courseInstanceId: string,
  groupUuid: string,
  groupName: string,
) {
  const syncedCourseInstances = await util.dumpTableWithSchema(
    'course_instances',
    CourseInstanceSchema,
  );
  const courseInstance = syncedCourseInstances.find((ci) => ci.short_name === courseInstanceId);
  assert.isOk(courseInstance);

  await execute(
    'INSERT INTO access_control_groups (uuid, name, course_instance_id) VALUES ($1, $2, $3)',
    [groupUuid, groupName, courseInstance.id],
  );
}

describe('getAccessControlForAssessment', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  describe('Basic retrieval', () => {
    it('returns empty array when no access control rules exist', async () => {
      await util.createAndSyncCourseData();

      // Don't set any access control rules
      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.isArray(result);
      assert.lengthOf(result, 0);
    });

    it('returns a single access control rule with correct format', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        enabled: true,
        blockAccess: false,
        listBeforeRelease: true,
        dateControl: {
          releaseDate: '2024-03-14T00:01:00Z',
          dueDate: '2024-03-21T23:59:00Z',
          durationMinutes: 60,
          password: 'secret123',
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 1);

      const retrieved = result[0];
      assert.equal(retrieved.enabled, true);
      assert.equal(retrieved.blockAccess, false);
      assert.equal(retrieved.listBeforeRelease, true);

      // Check dateControl
      assert.isOk(retrieved.dateControl);
      assert.equal(retrieved.dateControl.durationMinutes, 60);
      assert.equal(retrieved.dateControl.password, 'secret123');
      // Dates should be formatted as ISO strings (YYYY-MM-DDTHH:mm)
      assert.isString(retrieved.dateControl.releaseDate);
      assert.isString(retrieved.dateControl.dueDate);
    });
  });

  describe('Early and late deadlines', () => {
    it('returns early deadlines in the correct format', async () => {
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

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 1);

      const earlyDeadlines = result[0].dateControl?.earlyDeadlines;
      assert.isArray(earlyDeadlines);
      assert.lengthOf(earlyDeadlines!, 2);
      assert.equal(earlyDeadlines![0].credit, 120);
      assert.equal(earlyDeadlines![1].credit, 110);
      // Dates should be formatted as ISO strings
      assert.isString(earlyDeadlines![0].date);
      assert.isString(earlyDeadlines![1].date);
    });

    it('returns late deadlines in the correct format', async () => {
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

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 1);

      const lateDeadlines = result[0].dateControl?.lateDeadlines;
      assert.isArray(lateDeadlines);
      assert.lengthOf(lateDeadlines!, 2);
      assert.equal(lateDeadlines![0].credit, 80);
      assert.equal(lateDeadlines![1].credit, 50);
    });

    it('returns undefined for empty deadline arrays', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          earlyDeadlines: [],
          lateDeadlines: [],
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 1);

      // Empty arrays should be transformed to undefined
      assert.isUndefined(result[0].dateControl?.earlyDeadlines);
      assert.isUndefined(result[0].dateControl?.lateDeadlines);
    });
  });

  describe('After last deadline settings', () => {
    it('returns afterLastDeadline settings', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: {
          afterLastDeadline: {
            allowSubmissions: true,
            credit: 30,
          },
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 1);

      const afterLastDeadline = result[0].dateControl?.afterLastDeadline;
      assert.isOk(afterLastDeadline);
      assert.equal(afterLastDeadline.allowSubmissions, true);
      assert.equal(afterLastDeadline.credit, 30);
    });
  });

  describe('After complete settings', () => {
    it('returns afterComplete hideQuestions and hideScore settings', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        afterComplete: {
          hideQuestions: true,
          hideScore: true,
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 1);

      const afterComplete = result[0].afterComplete;
      assert.isOk(afterComplete);
      assert.equal(afterComplete.hideQuestions, true);
      assert.equal(afterComplete.hideScore, true);
    });
  });

  describe('Multiple rules with ordering', () => {
    it('returns multiple rules in correct order', async () => {
      const courseData = util.getCourseData();
      const groupUuid = crypto.randomUUID();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // Create group
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid, 'Test Group');

      // Create assignment-level rule and group-level rule
      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule = makeAccessControlRule({
        targets: [groupUuid],
        dateControl: { durationMinutes: 90 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [assignmentRule, groupRule]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 2);

      // First rule should be assignment-level (order 1)
      assert.equal(result[0].dateControl?.durationMinutes, 60);
      assert.isUndefined(result[0].targets);

      // Second rule should be group-level (order 2)
      assert.equal(result[1].dateControl?.durationMinutes, 90);
      assert.isArray(result[1].targets);
      assert.include(result[1].targets!, 'Test Group');
    });
  });

  describe('Group targets', () => {
    it('returns group names in targets array', async () => {
      const courseData = util.getCourseData();
      const groupUuid1 = crypto.randomUUID();
      const groupUuid2 = crypto.randomUUID();

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      // Create groups with different names
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid1, 'Section A');
      await createAccessControlGroup(util.COURSE_INSTANCE_ID, groupUuid2, 'Section B');

      // Create rules
      const assignmentRule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      const groupRule = makeAccessControlRule({
        targets: [groupUuid1, groupUuid2],
        dateControl: { durationMinutes: 90 },
      });

      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [assignmentRule, groupRule]);

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 2);

      // Group rule should have target names
      const targets = result[1].targets;
      assert.isArray(targets);
      assert.lengthOf(targets!, 2);
      assert.include(targets!, 'Section A');
      assert.include(targets!, 'Section B');
    });

    it('returns undefined for empty targets (assignment-level rule)', async () => {
      const courseData = util.getCourseData();
      const rule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 1);

      // Assignment-level rules should have undefined targets
      assert.isUndefined(result[0].targets);
    });
  });

  describe('PrairieTest control', () => {
    // Note: The prairieTestControl exams test is skipped because the 'exams' table
    // does not exist in the test database. The sync code attempts to look up exam IDs
    // by UUIDs which requires the exams table to exist.
    it.skip('returns prairieTestControl exams', async () => {
      const courseData = util.getCourseData();
      const examUuid1 = '11e89892-3eff-4d7f-90a2-221372f14e5c';
      const examUuid2 = '896c088c-7468-4045-965b-e8ae134086c2';

      const rule = makeAccessControlRule({
        dateControl: { durationMinutes: 60 },
        prairieTestControl: {
          exams: [{ examUuid: examUuid1 }, { examUuid: examUuid2, readOnly: true }],
        },
      });
      util.setAccessControlRules(courseData, util.ASSESSMENT_ID, [rule]);

      await util.writeAndSyncCourseData(courseData);

      const assessment = await findAssessment(util.ASSESSMENT_ID);
      assert.isOk(assessment);

      const result = await getAccessControlForAssessment(assessment.id);
      assert.lengthOf(result, 1);

      const prairieTestControl = result[0].prairieTestControl;
      assert.isOk(prairieTestControl);
      assert.isArray(prairieTestControl.exams);
      assert.lengthOf(prairieTestControl.exams!, 2);

      // Check exam UUIDs
      assert.equal(prairieTestControl.exams![0].examUuid, examUuid1);
      assert.equal(prairieTestControl.exams![1].examUuid, examUuid2);
      assert.equal(prairieTestControl.exams![1].readOnly, true);
    });
  });
});
