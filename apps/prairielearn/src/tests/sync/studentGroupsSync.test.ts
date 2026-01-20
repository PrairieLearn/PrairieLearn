import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { StudentGroupSchema } from '../../lib/db-types.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

/**
 * Helper to find synced student groups for a course instance.
 */
async function findSyncedStudentGroups(courseInstanceId: string) {
  const syncedGroups = await util.dumpTableWithSchema('student_groups', StudentGroupSchema);
  const courseInstances = await util.dumpTableWithSchema(
    'course_instances',
    (await import('../../lib/db-types.js')).CourseInstanceSchema,
  );
  const courseInstance = courseInstances.find((ci) => ci.short_name === courseInstanceId);
  assert.isOk(courseInstance);

  return syncedGroups.filter(
    (group) => group.course_instance_id === courseInstance.id && group.deleted_at == null,
  );
}

describe('Student groups syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  describe('Basic student group syncing', () => {
    it('syncs student groups from JSON to database', async () => {
      const courseData = util.getCourseData();

      // Add student groups to course instance
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'blue1' },
        { name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      const syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 2);

      const sectionA = syncedGroups.find((g) => g.name === 'Section A');
      const sectionB = syncedGroups.find((g) => g.name === 'Section B');

      assert.isOk(sectionA);
      assert.equal(sectionA.color, 'blue1');

      assert.isOk(sectionB);
      assert.equal(sectionB.color, 'green1');
    });

    it('adds a new student group', async () => {
      const { courseData, courseDir } = await util.createAndSyncCourseData();

      // Add initial groups
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      let syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 1);

      // Add another group
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'blue1' },
        { name: 'Section B', color: 'green1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 2);
    });

    it('removes a student group', async () => {
      const courseData = util.getCourseData();

      // Add two groups
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'blue1' },
        { name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 2);

      // Remove one group
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 1);
      assert.equal(syncedGroups[0].name, 'Section A');
    });

    it('updates a student group color', async () => {
      const courseData = util.getCourseData();

      // Add a group
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 1);
      assert.equal(syncedGroups[0].color, 'blue1');

      // Update the color
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'red1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 1);
      assert.equal(syncedGroups[0].color, 'red1');
    });

    it('deletes all groups when studentGroups is undefined', async () => {
      const courseData = util.getCourseData();

      // Add groups first
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'blue1' },
        { name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 2);

      // Remove studentGroups (undefined)
      delete courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups;

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 0);
    });

    it('deletes all groups when studentGroups is empty array', async () => {
      const courseData = util.getCourseData();

      // Add groups first
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [
        { name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 1);

      // Set to empty array
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentGroups = [];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedGroups = await findSyncedStudentGroups(util.COURSE_INSTANCE_ID);
      assert.equal(syncedGroups.length, 0);
    });
  });
});
