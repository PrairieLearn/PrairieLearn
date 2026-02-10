import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { CourseInstanceSchema, StudentLabelSchema } from '../../lib/db-types.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

/**
 * Helper to find synced student labels for a course instance.
 */
async function findSyncedStudentLabels(courseInstanceId: string) {
  const syncedLabels = await util.dumpTableWithSchema('student_labels', StudentLabelSchema);
  const courseInstances = await util.dumpTableWithSchema('course_instances', CourseInstanceSchema);
  const courseInstance = courseInstances.find((ci) => ci.short_name === courseInstanceId);
  assert.isOk(courseInstance);

  return syncedLabels.filter((label) => label.course_instance_id === courseInstance.id);
}

describe('Student labels syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  describe('Basic student label syncing', () => {
    it('syncs student labels from JSON to database', async () => {
      const courseData = util.getCourseData();

      // Add student labels to course instance
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'blue1' },
        { name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      const syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);

      const sectionA = syncedLabels.find((l) => l.name === 'Section A');
      const sectionB = syncedLabels.find((l) => l.name === 'Section B');

      assert.isOk(sectionA);
      assert.equal(sectionA.color, 'blue1');

      assert.isOk(sectionB);
      assert.equal(sectionB.color, 'green1');
    });

    it('adds a new student label', async () => {
      const { courseData, courseDir } = await util.createAndSyncCourseData();

      // Add initial labels
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);

      // Add another label
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'blue1' },
        { name: 'Section B', color: 'green1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);
    });

    it('removes a student label', async () => {
      const courseData = util.getCourseData();

      // Add two labels
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'blue1' },
        { name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);

      // Remove one label
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);
      assert.equal(syncedLabels[0].name, 'Section A');
    });

    it('updates a student label color', async () => {
      const courseData = util.getCourseData();

      // Add a label
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);
      assert.equal(syncedLabels[0].color, 'blue1');

      // Update the color
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'red1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);
      assert.equal(syncedLabels[0].color, 'red1');
    });

    it('deletes all labels when studentLabels is undefined', async () => {
      const courseData = util.getCourseData();

      // Add labels first
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'blue1' },
        { name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);

      // Remove studentLabels (undefined)
      delete courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels;

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 0);
    });

    it('deletes all labels when studentLabels is empty array', async () => {
      const courseData = util.getCourseData();

      // Add labels first
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);

      // Set to empty array
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 0);
    });
  });
});
