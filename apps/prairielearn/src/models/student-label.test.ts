import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { HttpStatusError } from '@prairielearn/error';
import { queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import type { Enrollment } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import { uniqueEnrollmentCode } from '../sync/fromDisk/courseInstances.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectCourseInstanceById } from './course-instances.js';
import { ensureUncheckedEnrollment } from './enrollment.js';
import {
  addEnrollmentToStudentLabel,
  createStudentLabel,
  deleteStudentLabel,
  removeEnrollmentFromStudentLabel,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelById,
  selectStudentLabelsByCourseInstance,
  selectStudentLabelsForEnrollment,
  updateStudentLabel,
  verifyLabelBelongsToCourseInstance,
} from './student-label.js';

let enrollmentCounter = 0;

async function createEnrollment(courseInstanceId = '1'): Promise<Enrollment> {
  enrollmentCounter++;
  const uid = `test${enrollmentCounter}@example.com`;
  const user = await getOrCreateUser({
    uid,
    name: `Test User ${enrollmentCounter}`,
    uin: uid,
    email: uid,
  });
  const courseInstance = await selectCourseInstanceById(courseInstanceId);
  const enrollment = await ensureUncheckedEnrollment({
    userId: user.id,
    courseInstance,
    requiredRole: ['System'],
    authzData: dangerousFullSystemAuthz(),
    actionDetail: 'implicit_joined',
  });
  assert.isNotNull(enrollment);
  return enrollment;
}

describe('Student Label Model', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
  });

  afterEach(async function () {
    await helperDb.after();
  });

  describe('createStudentLabel', () => {
    it('creates student labels with unique ids', async () => {
      const label1 = await createStudentLabel({ course_instance_id: '1', name: 'Label 1' });
      const label2 = await createStudentLabel({ course_instance_id: '1', name: 'Label 2' });

      assert.notEqual(label1.id, label2.id);
      assert.equal(label1.course_instance_id, label2.course_instance_id);
      assert.equal(label1.name, 'Label 1');
      assert.equal(label2.name, 'Label 2');
    });

    it('allows creating label with same name after soft deletion', async () => {
      const label1 = await createStudentLabel({ course_instance_id: '1', name: 'Test Label' });
      await deleteStudentLabel(label1.id);

      const label2 = await createStudentLabel({ course_instance_id: '1', name: 'Test Label' });

      assert.notEqual(label1.id, label2.id);
      assert.equal(label2.name, 'Test Label');
      assert.isNull(label2.deleted_at);
    });
  });

  describe('selectStudentLabelsByCourseInstance', () => {
    it('returns all non-deleted labels for a course instance', async () => {
      // Empty initially
      assert.isEmpty(await selectStudentLabelsByCourseInstance('1'));

      await createStudentLabel({ course_instance_id: '1', name: 'Label A' });
      await createStudentLabel({ course_instance_id: '1', name: 'Label B' });
      const labelToDelete = await createStudentLabel({ course_instance_id: '1', name: 'Label C' });

      await deleteStudentLabel(labelToDelete.id);

      const labels = await selectStudentLabelsByCourseInstance('1');
      assert.equal(labels.length, 2);
      assert.equal(labels[0].name, 'Label A');
      assert.equal(labels[1].name, 'Label B');
    });
  });

  describe('selectStudentLabelById', () => {
    it('returns student label by id', async () => {
      const createdLabel = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      const retrievedLabel = await selectStudentLabelById(createdLabel.id);
      assert.equal(retrievedLabel.id, createdLabel.id);
      assert.equal(retrievedLabel.name, 'Test Label');
    });

    it('throws error for non-existent or deleted labels', async () => {
      try {
        await selectStudentLabelById('999999');
        assert.fail('Expected error');
      } catch (err) {
        assert.instanceOf(err, Error);
      }

      const label = await createStudentLabel({ course_instance_id: '1', name: 'Test Label' });
      await deleteStudentLabel(label.id);

      try {
        await selectStudentLabelById(label.id);
        assert.fail('Expected error');
      } catch (err) {
        assert.instanceOf(err, Error);
      }
    });
  });

  describe('deleteStudentLabel', () => {
    it('throws error when deleting non-existent label', async () => {
      try {
        await deleteStudentLabel('999999');
        assert.fail('Expected error');
      } catch (err) {
        assert.instanceOf(err, Error);
      }
    });
  });

  describe('addEnrollmentToStudentLabel', () => {
    it('adds enrollment to label and returns null on duplicate', async () => {
      const enrollment = await createEnrollment();
      const label = await createStudentLabel({ course_instance_id: '1', name: 'Test Label' });

      const result = await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      assert.isNotNull(result);
      assert.equal(result.enrollment_id, enrollment.id);
      assert.equal(result.student_label_id, label.id);

      // Adding again returns null
      const duplicate = await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });
      assert.isNull(duplicate);
    });

    it('returns null when enrollment and label belong to different course instances', async () => {
      const enrollment = await createEnrollment('1');

      const courseInstance2Id = await queryRow(
        `INSERT INTO course_instances (course_id, display_timezone, enrollment_code)
         VALUES ($course_id, $display_timezone, $enrollment_code)
         RETURNING id`,
        {
          course_id: '1',
          display_timezone: 'America/Chicago',
          enrollment_code: await uniqueEnrollmentCode(),
        },
        IdSchema,
      );

      const label = await createStudentLabel({
        course_instance_id: courseInstance2Id,
        name: 'Test Label',
      });

      const result = await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      assert.isNull(result);
    });
  });

  describe('removeEnrollmentFromStudentLabel', () => {
    it('removes enrollment from label', async () => {
      const enrollment = await createEnrollment();
      const label = await createStudentLabel({ course_instance_id: '1', name: 'Test Label' });

      await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });
      await removeEnrollmentFromStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      assert.isEmpty(await selectEnrollmentsInStudentLabel(label.id));
    });
  });

  describe('selectEnrollmentsInStudentLabel', () => {
    it('returns enrollments in label', async () => {
      const label = await createStudentLabel({ course_instance_id: '1', name: 'Test Label' });

      // Empty initially
      assert.isEmpty(await selectEnrollmentsInStudentLabel(label.id));

      const enrollment1 = await createEnrollment();
      const enrollment2 = await createEnrollment();

      await addEnrollmentToStudentLabel({
        enrollment_id: enrollment1.id,
        student_label_id: label.id,
      });
      await addEnrollmentToStudentLabel({
        enrollment_id: enrollment2.id,
        student_label_id: label.id,
      });

      const enrollments = await selectEnrollmentsInStudentLabel(label.id);
      assert.equal(enrollments.length, 2);
      assert.isTrue(enrollments.some((e) => e.id === enrollment1.id));
      assert.isTrue(enrollments.some((e) => e.id === enrollment2.id));
    });
  });

  describe('selectStudentLabelsForEnrollment', () => {
    it('returns non-deleted labels for enrollment', async () => {
      const enrollment = await createEnrollment();

      // Empty initially
      assert.isEmpty(await selectStudentLabelsForEnrollment(enrollment.id));

      const label1 = await createStudentLabel({ course_instance_id: '1', name: 'Label A' });
      const label2 = await createStudentLabel({ course_instance_id: '1', name: 'Label B' });

      await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label1.id,
      });
      await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label2.id,
      });

      const labels = await selectStudentLabelsForEnrollment(enrollment.id);
      assert.equal(labels.length, 2);
      assert.isTrue(labels.some((l) => l.id === label1.id));
      assert.isTrue(labels.some((l) => l.id === label2.id));

      // Excludes soft-deleted labels
      await deleteStudentLabel(label1.id);
      const labelsAfterDelete = await selectStudentLabelsForEnrollment(enrollment.id);
      assert.equal(labelsAfterDelete.length, 1);
      assert.equal(labelsAfterDelete[0].id, label2.id);
    });
  });

  describe('updateStudentLabel', () => {
    it('updates label name and color', async () => {
      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Original Name',
        color: 'blue1',
      });

      const updatedLabel = await updateStudentLabel({
        id: label.id,
        name: 'New Name',
        color: 'green1',
      });

      assert.equal(updatedLabel.id, label.id);
      assert.equal(updatedLabel.name, 'New Name');
      assert.equal(updatedLabel.color, 'green1');
    });
  });

  describe('verifyLabelBelongsToCourseInstance', () => {
    it('returns label when it belongs to the course instance', async () => {
      const label = await createStudentLabel({ course_instance_id: '1', name: 'Test Label' });

      const verifiedLabel = await verifyLabelBelongsToCourseInstance(label.id, '1');
      assert.equal(verifiedLabel.id, label.id);
    });

    it('throws 403 when label does not belong to course instance', async () => {
      const label = await createStudentLabel({ course_instance_id: '1', name: 'Test Label' });

      try {
        await verifyLabelBelongsToCourseInstance(label.id, '999999');
        assert.fail('Expected error');
      } catch (err) {
        assert.instanceOf(err, HttpStatusError);
        assert.equal(err.status, 403);
      }
    });
  });
});
