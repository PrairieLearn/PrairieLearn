import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

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

describe('Student Label Model', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
  });

  afterEach(async function () {
    await helperDb.after();
  });

  describe('createStudentLabel', () => {
    it('creates student labels', async () => {
      const label1 = await createStudentLabel({
        course_instance_id: '1',
        name: 'Label 1',
      });

      const label2 = await createStudentLabel({
        course_instance_id: '1',
        name: 'Label 2',
      });

      assert.notEqual(label1.id, label2.id);
      assert.equal(label1.course_instance_id, label2.course_instance_id);
      assert.equal(label1.name, 'Label 1');
      assert.equal(label2.name, 'Label 2');
    });

    it('allows creating student label with same name after soft deletion', async () => {
      const label1 = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      // Soft delete the label
      await deleteStudentLabel(label1.id);

      // Should be able to create another label with the same name
      const label2 = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      assert.notEqual(label1.id, label2.id);
      assert.equal(label2.name, 'Test Label');
      assert.isNull(label2.deleted_at);
    });
  });

  describe('selectStudentLabelsByCourseInstance', () => {
    it('returns empty array when no student labels exist', async () => {
      const labels = await selectStudentLabelsByCourseInstance('1');
      assert.equal(labels.length, 0);
    });

    it('returns all student labels for a course instance', async () => {
      await createStudentLabel({
        course_instance_id: '1',
        name: 'Label A',
      });

      await createStudentLabel({
        course_instance_id: '1',
        name: 'Label B',
      });

      await createStudentLabel({
        course_instance_id: '1',
        name: 'Label C',
      });

      const labels = await selectStudentLabelsByCourseInstance('1');
      assert.equal(labels.length, 3);
      assert.equal(labels[0].name, 'Label A');
      assert.equal(labels[1].name, 'Label B');
      assert.equal(labels[2].name, 'Label C');
    });

    it('excludes soft-deleted student labels', async () => {
      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      await deleteStudentLabel(label.id);

      const labels = await selectStudentLabelsByCourseInstance('1');
      assert.equal(labels.length, 0);
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
      assert.equal(retrievedLabel.course_instance_id, '1');
    });

    it('throws an error retrieving a non-existent student label', async () => {
      try {
        await selectStudentLabelById('999999');
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }

      // Soft deleted label
      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      await deleteStudentLabel(label.id);

      try {
        await selectStudentLabelById(label.id);
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }
    });
  });

  describe('deleteStudentLabel', () => {
    it('throws error when deleting non-existent student label', async () => {
      try {
        await deleteStudentLabel('999999');
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }
    });
  });

  describe('addEnrollmentToStudentLabel', () => {
    it('adds enrollment to student label', async () => {
      const user = await getOrCreateUser({
        uid: 'test@example.com',
        name: 'Test User',
        uin: 'test1',
        email: 'test@example.com',
      });

      const enrollment = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      const enrollmentLabel = await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      assert.isNotNull(enrollmentLabel);
      assert.equal(enrollmentLabel.enrollment_id, enrollment.id);
      assert.equal(enrollmentLabel.student_label_id, label.id);
    });

    it('returns null when enrollment is already in label', async () => {
      const user = await getOrCreateUser({
        uid: 'test2@example.com',
        name: 'Test User 2',
        uin: 'test2',
        email: 'test2@example.com',
      });

      const enrollment = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      const result = await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      assert.isNull(result);
    });

    it('returns null when trying to add enrollment to student label from different course instance', async () => {
      const user = await getOrCreateUser({
        uid: 'test3@example.com',
        name: 'Test User 3',
        uin: 'test3',
        email: 'test3@example.com',
      });

      // Create enrollment in course instance 1
      const enrollment = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      // Create a second course instance for testing
      const courseInstance2Id = await queryRow(
        `INSERT INTO course_instances (course_id, short_name, long_name, display_timezone, enrollment_code)
         VALUES ($course_id, $short_name, $long_name, $display_timezone, $enrollment_code)
         RETURNING id`,
        {
          course_id: '1',
          short_name: 'test-instance-2',
          long_name: 'Test Instance 2',
          display_timezone: 'America/Chicago',
          enrollment_code: 'test-code-2',
        },
        IdSchema,
      );

      // Create student label in course instance 2
      const label = await createStudentLabel({
        course_instance_id: courseInstance2Id,
        name: 'Test Label',
      });

      // Try to add enrollment from course instance 1 to label in different course instance
      // This should return null because the course instances don't match
      const result = await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      assert.isNull(result);
    });
  });

  describe('removeEnrollmentFromStudentLabel', () => {
    it('removes enrollment from student label', async () => {
      const user = await getOrCreateUser({
        uid: 'test3@example.com',
        name: 'Test User 3',
        uin: 'test3',
        email: 'test3@example.com',
      });

      const enrollment = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      await removeEnrollmentFromStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      const enrollments = await selectEnrollmentsInStudentLabel(label.id);
      assert.equal(enrollments.length, 0);
    });
  });

  describe('selectEnrollmentsInStudentLabel', () => {
    it('returns enrollments in student label', async () => {
      const user1 = await getOrCreateUser({
        uid: 'user1@example.com',
        name: 'User 1',
        uin: 'user1',
        email: 'user1@example.com',
      });

      const user2 = await getOrCreateUser({
        uid: 'user2@example.com',
        name: 'User 2',
        uin: 'user2',
        email: 'user2@example.com',
      });

      const enrollment1 = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user1.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const enrollment2 = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user2.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

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

    it('returns empty array when no enrollments in label', async () => {
      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Empty Label',
      });

      const enrollments = await selectEnrollmentsInStudentLabel(label.id);
      assert.equal(enrollments.length, 0);
    });
  });

  describe('selectStudentLabelsForEnrollment', () => {
    it('returns student labels for enrollment', async () => {
      const user = await getOrCreateUser({
        uid: 'user4@example.com',
        name: 'User 4',
        uin: 'user4',
        email: 'user4@example.com',
      });

      const enrollment = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const label1 = await createStudentLabel({
        course_instance_id: '1',
        name: 'Label A',
      });

      const label2 = await createStudentLabel({
        course_instance_id: '1',
        name: 'Label B',
      });

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
    });

    it('returns empty array when enrollment not in any labels', async () => {
      const user = await getOrCreateUser({
        uid: 'user5@example.com',
        name: 'User 5',
        uin: 'user5',
        email: 'user5@example.com',
      });

      const enrollment = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const labels = await selectStudentLabelsForEnrollment(enrollment.id);
      assert.equal(labels.length, 0);
    });

    it('excludes soft-deleted student labels', async () => {
      const user = await getOrCreateUser({
        uid: 'user6@example.com',
        name: 'User 6',
        uin: 'user6',
        email: 'user6@example.com',
      });

      const enrollment = await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
         RETURNING *`,
        {
          user_id: user.id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      await addEnrollmentToStudentLabel({
        enrollment_id: enrollment.id,
        student_label_id: label.id,
      });

      await deleteStudentLabel(label.id);

      const labels = await selectStudentLabelsForEnrollment(enrollment.id);
      assert.equal(labels.length, 0);
    });
  });

  describe('updateStudentLabel', () => {
    it('updates student label name and color', async () => {
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

    it('sets color to null when null is passed', async () => {
      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
        color: 'blue1',
      });

      const updatedLabel = await updateStudentLabel({
        id: label.id,
        name: 'Test Label',
        color: null,
      });

      assert.equal(updatedLabel.color, null);
    });
  });

  describe('verifyLabelBelongsToCourseInstance', () => {
    it('returns label when it belongs to the course instance', async () => {
      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      const verifiedLabel = await verifyLabelBelongsToCourseInstance(label.id, '1');
      assert.equal(verifiedLabel.id, label.id);
      assert.equal(verifiedLabel.name, 'Test Label');
    });

    it('throws 403 when label does not belong to course instance', async () => {
      const label = await createStudentLabel({
        course_instance_id: '1',
        name: 'Test Label',
      });

      try {
        await verifyLabelBelongsToCourseInstance(label.id, '999999');
        assert.fail('Expected error to be thrown');
      } catch (err: any) {
        assert.equal(err.status, 403);
        assert.include(err.message, 'does not belong to this course instance');
      }
    });
  });
});
