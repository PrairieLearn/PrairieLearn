import crypto from 'node:crypto';

import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { selectAuditEvents } from '../../models/audit-event.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import {
  addLabelToEnrollments,
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

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);

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

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
        { uuid: uuid2, name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);

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

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);
      assert.equal(syncedLabels[0].color, 'blue1');

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

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: crypto.randomUUID(), name: 'Section A', color: 'blue1' },
        { uuid: crypto.randomUUID(), name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);

      delete courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels;

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 0);
    });

    it('deletes all labels when studentLabels is empty array', async () => {
      const courseData = util.getCourseData();

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: crypto.randomUUID(), name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 0);
    });

    it('renames a student label while preserving enrollments', async () => {
      const uuid1 = crypto.randomUUID();
      const courseData = util.getCourseData();

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);
      const originalLabel = syncedLabels[0];
      assert.equal(originalLabel.name, 'Section A');

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
      await addLabelToEnrollments({
        enrollments: [enrollment],
        label: originalLabel,
        authzData: dangerousFullSystemAuthz(),
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section 1', color: 'blue1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 1);

      const renamedLabel = syncedLabels[0];
      assert.equal(renamedLabel.id, originalLabel.id);
      assert.equal(renamedLabel.name, 'Section 1');
      assert.equal(renamedLabel.uuid, originalLabel.uuid);

      const enrollmentLabels = await selectStudentLabelsForEnrollment(enrollment);
      assert.equal(enrollmentLabels.length, 1);
      assert.equal(enrollmentLabels[0].id, originalLabel.id);
      assert.equal(enrollmentLabels[0].name, 'Section 1');
    });

    it('swaps names between two labels', async () => {
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();
      const courseData = util.getCourseData();

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section A', color: 'blue1' },
        { uuid: uuid2, name: 'Section B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      let syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);

      const labelA = syncedLabels.find((l) => l.uuid === uuid1);
      const labelB = syncedLabels.find((l) => l.uuid === uuid2);
      assert.isOk(labelA);
      assert.isOk(labelB);
      assert.equal(labelA.name, 'Section A');
      assert.equal(labelB.name, 'Section B');

      // Swap the names.
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'Section B', color: 'blue1' },
        { uuid: uuid2, name: 'Section A', color: 'green1' },
      ];

      await util.overwriteAndSyncCourseData(courseData, courseDir);

      syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 2);

      const updatedA = syncedLabels.find((l) => l.uuid === uuid1);
      const updatedB = syncedLabels.find((l) => l.uuid === uuid2);
      assert.isOk(updatedA);
      assert.isOk(updatedB);
      assert.equal(updatedA.name, 'Section B');
      assert.equal(updatedA.id, labelA.id);
      assert.equal(updatedB.name, 'Section A');
      assert.equal(updatedB.id, labelB.id);
    });

    it('produces a sync error for duplicate UUIDs', async () => {
      const sharedUuid = crypto.randomUUID();
      const courseData = util.getCourseData();

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: sharedUuid, name: 'Label A', color: 'blue1' },
        { uuid: sharedUuid, name: 'Label B', color: 'green1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      const results = await util.syncCourseData(courseDir);
      assert.isOk(results.status === 'complete');

      const courseInstanceData = results.courseData.courseInstances[util.COURSE_INSTANCE_ID];
      assert.isOk(courseInstanceData);
      const errors = courseInstanceData.courseInstance.errors;
      assert.isAbove(errors.length, 0);
      assert.isOk(
        errors.some((e: string) => e.includes('duplicate UUID') && e.includes(sharedUuid)),
      );

      // Labels should not be synced because the course instance has errors.
      const syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      assert.equal(syncedLabels.length, 0);
    });

    it('creates audit events when label is deleted via sync', async () => {
      const uuid1 = crypto.randomUUID();
      const courseData = util.getCourseData();

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
        { uuid: uuid1, name: 'SyncLabel', color: 'red1' },
      ];

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);

      const syncedLabels = await findSyncedStudentLabels(util.COURSE_INSTANCE_ID);
      const syncLabel = syncedLabels.find((l) => l.name === 'SyncLabel');
      assert.isOk(syncLabel);

      const course = await selectCourseByShortName('TEST 101');
      const courseInstance = await selectCourseInstanceByShortName({
        course,
        shortName: util.COURSE_INSTANCE_ID,
      });

      const user1 = await getOrCreateUser({
        uid: 'audit-test1@example.com',
        name: 'Audit Test User 1',
        uin: 'audit-test1@example.com',
        email: 'audit-test1@example.com',
      });
      const user2 = await getOrCreateUser({
        uid: 'audit-test2@example.com',
        name: 'Audit Test User 2',
        uin: 'audit-test2@example.com',
        email: 'audit-test2@example.com',
      });

      const enrollment1 = await ensureUncheckedEnrollment({
        userId: user1.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
      const enrollment2 = await ensureUncheckedEnrollment({
        userId: user2.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
      assert.isNotNull(enrollment1);
      assert.isNotNull(enrollment2);

      await addLabelToEnrollments({
        enrollments: [enrollment1, enrollment2],
        label: syncLabel,
        authzData: dangerousFullSystemAuthz(),
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [];
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      const auditEvents1 = await selectAuditEvents({
        subject_user_id: enrollment1.user_id!,
        table_names: ['student_label_enrollments'],
        course_instance_id: courseInstance.id,
      });
      const auditEvents2 = await selectAuditEvents({
        subject_user_id: enrollment2.user_id!,
        table_names: ['student_label_enrollments'],
        course_instance_id: courseInstance.id,
      });

      assert.equal(auditEvents1.length, 2);
      const deleteEvent1 = auditEvents1.find((e) => e.action === 'delete');
      assert.isDefined(deleteEvent1);
      assert.equal(deleteEvent1.action_detail, 'enrollment_removed');
      assert.deepEqual(deleteEvent1.context, { label_name: 'SyncLabel' });

      assert.equal(auditEvents2.length, 2);
      const deleteEvent2 = auditEvents2.find((e) => e.action === 'delete');
      assert.isDefined(deleteEvent2);
      assert.equal(deleteEvent2.action_detail, 'enrollment_removed');
      assert.deepEqual(deleteEvent2.context, { label_name: 'SyncLabel' });
    });
  });
});
