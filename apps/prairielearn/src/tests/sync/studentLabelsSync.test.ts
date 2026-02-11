import crypto from 'node:crypto';

import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import {
  addEnrollmentsToStudentLabel,
  selectStudentLabelsForEnrollment,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
import * as helperDb from '../helperDb.js';
import { getOrCreateUser } from '../utils/auth.js';

import * as util from './util.js';

async function findSyncedStudentLabels(courseInstanceShortName: string) {
  const course = await selectCourseByShortName('TEST 101');
  const courseInstance = await selectCourseInstanceByShortName({
    course,
    shortName: courseInstanceShortName,
  });
  return selectStudentLabelsInCourseInstance(courseInstance);
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
        { uuid: crypto.randomUUID(), name: 'Section A', color: 'blue1' },
        { uuid: crypto.randomUUID(), name: 'Section B', color: 'green1' },
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
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();
      const { courseData, courseDir } = await util.createAndSyncCourseData();

      // Add initial labels
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);

      // Add another label
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
        { uuid: uuid2, name: 'Section B', color: 'green1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);
    });

    it('removes a student label', async () => {
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();
      const courseData = util.getCourseData();

      // Add two labels
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
        { uuid: uuid2, name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);

      // Remove one label
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);
      assert.equal(syncedLabels[0].name, 'Section A');
    });

    it('updates a student label color', async () => {
      const uuid1 = crypto.randomUUID();
      const courseData = util.getCourseData();

      // Add a label
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);
      assert.equal(syncedLabels[0].color, 'blue1');

      // Update the color
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'red1' },
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
        { uuid: crypto.randomUUID(), name: 'Section A', color: 'blue1' },
        { uuid: crypto.randomUUID(), name: 'Section B', color: 'green1' },
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
        { uuid: crypto.randomUUID(), name: 'Section A', color: 'blue1' },
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

    it('renames a student label while preserving enrollments', async () => {
      const uuid1 = crypto.randomUUID();
      const courseData = util.getCourseData();

      // Add a label
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);
      const originalLabel = syncedLabels[0];
      assert.equal(originalLabel.name, 'Section A');

      // Create an enrollment and add it to the label
      const course = await selectCourseByShortName('TEST 101');
      const courseInstance = await selectCourseInstanceByShortName({
        course,
        shortName: util.COURSE_INSTANCE_ID,
      });
      const user = await getOrCreateUser({
        uid: 'rename-test@example.com',
        name: 'Rename Test User',
        uin: 'rename-test@example.com',
        email: 'rename-test@example.com',
      });
      const enrollment = await ensureUncheckedEnrollment({
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
      assert.isNotNull(enrollment);
      await addEnrollmentsToStudentLabel({
        enrollments: [enrollment],
        label: originalLabel,
        authzData: dangerousFullSystemAuthz(),
      });

      // Rename the label (same UUID, different name)
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section 1', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);

      const renamedLabel = syncedLabels[0];
      // Same database row (id preserved)
      assert.equal(renamedLabel.id, originalLabel.id);
      // Name updated
      assert.equal(renamedLabel.name, 'Section 1');
      // UUID unchanged
      assert.equal(renamedLabel.uuid, originalLabel.uuid);

      // Enrollment is still linked
      const enrollmentLabels = await selectStudentLabelsForEnrollment(enrollment);
      assert.equal(enrollmentLabels.length, 1);
      assert.equal(enrollmentLabels[0].id, originalLabel.id);
      assert.equal(enrollmentLabels[0].name, 'Section 1');
    });
  });
});
