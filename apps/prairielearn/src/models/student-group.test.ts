import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import {
  addEnrollmentToStudentGroup,
  createStudentGroup,
  createStudentGroupAndAddEnrollments,
  createStudentGroupWithErrorHandling,
  deleteStudentGroup,
  removeEnrollmentFromStudentGroup,
  renameStudentGroup,
  selectEnrollmentsInStudentGroup,
  selectStudentGroupById,
  selectStudentGroupsByCourseInstance,
  selectStudentGroupsForEnrollment,
  updateStudentGroup,
  verifyGroupBelongsToCourseInstance,
} from './student-group.js';

describe('Student Group Model', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
  });

  afterEach(async function () {
    await helperDb.after();
  });

  describe('createStudentGroup', () => {
    it('creates student groups', async () => {
      const group1 = await createStudentGroup({
        course_instance_id: '1',
        name: 'Group 1',
      });

      const group2 = await createStudentGroup({
        course_instance_id: '1',
        name: 'Group 2',
      });

      assert.notEqual(group1.id, group2.id);
      assert.equal(group1.course_instance_id, group2.course_instance_id);
      assert.equal(group1.name, 'Group 1');
      assert.equal(group2.name, 'Group 2');
    });

    it('allows creating student group with same name after soft deletion', async () => {
      const group1 = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      // Soft delete the group
      await deleteStudentGroup(group1.id);

      // Should be able to create another group with the same name
      const group2 = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      assert.notEqual(group1.id, group2.id);
      assert.equal(group2.name, 'Test Group');
      assert.isNull(group2.deleted_at);
    });
  });

  describe('selectStudentGroupsByCourseInstance', () => {
    it('returns empty array when no student groups exist', async () => {
      const groups = await selectStudentGroupsByCourseInstance('1');
      assert.equal(groups.length, 0);
    });

    it('returns all student groups for a course instance', async () => {
      await createStudentGroup({
        course_instance_id: '1',
        name: 'Group A',
      });

      await createStudentGroup({
        course_instance_id: '1',
        name: 'Group B',
      });

      await createStudentGroup({
        course_instance_id: '1',
        name: 'Group C',
      });

      const groups = await selectStudentGroupsByCourseInstance('1');
      assert.equal(groups.length, 3);
      assert.equal(groups[0].name, 'Group A');
      assert.equal(groups[1].name, 'Group B');
      assert.equal(groups[2].name, 'Group C');
    });

    it('excludes soft-deleted student groups', async () => {
      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await deleteStudentGroup(group.id);

      const groups = await selectStudentGroupsByCourseInstance('1');
      assert.equal(groups.length, 0);
    });
  });

  describe('selectStudentGroupById', () => {
    it('returns student group by id', async () => {
      const createdGroup = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      const retrievedGroup = await selectStudentGroupById(createdGroup.id);
      assert.equal(retrievedGroup.id, createdGroup.id);
      assert.equal(retrievedGroup.name, 'Test Group');
      assert.equal(retrievedGroup.course_instance_id, '1');
    });

    it('throws an error retrieving a non-existent student group', async () => {
      try {
        await selectStudentGroupById('999999');
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }

      // Soft deleted group
      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await deleteStudentGroup(group.id);

      try {
        await selectStudentGroupById(group.id);
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }
    });
  });

  describe('renameStudentGroup', () => {
    it('renames an student group', async () => {
      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Old Name',
      });

      const renamedGroup = await renameStudentGroup({
        id: group.id,
        name: 'New Name',
      });

      assert.equal(renamedGroup.id, group.id);
      assert.equal(renamedGroup.name, 'New Name');
      assert.equal(renamedGroup.course_instance_id, group.course_instance_id);
    });

    it('throws error when renaming non-existent student group', async () => {
      try {
        await renameStudentGroup({
          id: '999999',
          name: 'New Name',
        });
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }
    });
  });

  describe('deleteStudentGroup', () => {
    it('throws error when deleting non-existent student group', async () => {
      try {
        await deleteStudentGroup('999999');
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }
    });
  });

  describe('addEnrollmentToStudentGroup', () => {
    it('adds enrollment to student group', async () => {
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

      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      const enrollmentGroup = await addEnrollmentToStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group.id,
      });

      assert.isNotNull(enrollmentGroup);
      assert.equal(enrollmentGroup.enrollment_id, enrollment.id);
      assert.equal(enrollmentGroup.student_group_id, group.id);
    });

    it('returns null when enrollment is already in group', async () => {
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

      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await addEnrollmentToStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group.id,
      });

      const result = await addEnrollmentToStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group.id,
      });

      assert.isNull(result);
    });

    it('returns null when trying to add enrollment to student group from different course instance', async () => {
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

      // Create student group in course instance 2
      const group = await createStudentGroup({
        course_instance_id: courseInstance2Id,
        name: 'Test Group',
      });

      // Try to add enrollment from course instance 1 to group in different course instance
      // This should return null because the course instances don't match
      const result = await addEnrollmentToStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group.id,
      });

      assert.isNull(result);
    });
  });

  describe('removeEnrollmentFromStudentGroup', () => {
    it('removes enrollment from student group', async () => {
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

      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await addEnrollmentToStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group.id,
      });

      await removeEnrollmentFromStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group.id,
      });

      const enrollments = await selectEnrollmentsInStudentGroup(group.id);
      assert.equal(enrollments.length, 0);
    });
  });

  describe('selectEnrollmentsInStudentGroup', () => {
    it('returns enrollments in student group', async () => {
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

      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await addEnrollmentToStudentGroup({
        enrollment_id: enrollment1.id,
        student_group_id: group.id,
      });

      await addEnrollmentToStudentGroup({
        enrollment_id: enrollment2.id,
        student_group_id: group.id,
      });

      const enrollments = await selectEnrollmentsInStudentGroup(group.id);
      assert.equal(enrollments.length, 2);
      assert.isTrue(enrollments.some((e) => e.id === enrollment1.id));
      assert.isTrue(enrollments.some((e) => e.id === enrollment2.id));
    });

    it('returns empty array when no enrollments in group', async () => {
      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Empty Group',
      });

      const enrollments = await selectEnrollmentsInStudentGroup(group.id);
      assert.equal(enrollments.length, 0);
    });
  });

  describe('selectStudentGroupsForEnrollment', () => {
    it('returns student groups for enrollment', async () => {
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

      const group1 = await createStudentGroup({
        course_instance_id: '1',
        name: 'Group A',
      });

      const group2 = await createStudentGroup({
        course_instance_id: '1',
        name: 'Group B',
      });

      await addEnrollmentToStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group1.id,
      });

      await addEnrollmentToStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group2.id,
      });

      const groups = await selectStudentGroupsForEnrollment(enrollment.id);
      assert.equal(groups.length, 2);
      assert.isTrue(groups.some((g) => g.id === group1.id));
      assert.isTrue(groups.some((g) => g.id === group2.id));
    });

    it('returns empty array when enrollment not in any groups', async () => {
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

      const groups = await selectStudentGroupsForEnrollment(enrollment.id);
      assert.equal(groups.length, 0);
    });

    it('excludes soft-deleted student groups', async () => {
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

      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await addEnrollmentToStudentGroup({
        enrollment_id: enrollment.id,
        student_group_id: group.id,
      });

      await deleteStudentGroup(group.id);

      const groups = await selectStudentGroupsForEnrollment(enrollment.id);
      assert.equal(groups.length, 0);
    });
  });

  describe('updateStudentGroup', () => {
    it('updates student group name and color', async () => {
      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Original Name',
        color: 'blue1',
      });

      const updatedGroup = await updateStudentGroup({
        id: group.id,
        name: 'New Name',
        color: 'green1',
      });

      assert.equal(updatedGroup.id, group.id);
      assert.equal(updatedGroup.name, 'New Name');
      assert.equal(updatedGroup.color, 'green1');
    });

    it('sets color to null when null is passed', async () => {
      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
        color: 'blue1',
      });

      const updatedGroup = await updateStudentGroup({
        id: group.id,
        name: 'Test Group',
        color: null,
      });

      assert.equal(updatedGroup.color, null);
    });
  });

  describe('verifyGroupBelongsToCourseInstance', () => {
    it('returns group when it belongs to the course instance', async () => {
      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      const verifiedGroup = await verifyGroupBelongsToCourseInstance(group.id, '1');
      assert.equal(verifiedGroup.id, group.id);
      assert.equal(verifiedGroup.name, 'Test Group');
    });

    it('throws 403 when group does not belong to course instance', async () => {
      const group = await createStudentGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      try {
        await verifyGroupBelongsToCourseInstance(group.id, '999999');
        assert.fail('Expected error to be thrown');
      } catch (err: any) {
        assert.equal(err.status, 403);
        assert.include(err.message, 'does not belong to this course instance');
      }
    });
  });

  describe('createStudentGroupWithErrorHandling', () => {
    it('creates a student group successfully', async () => {
      const group = await createStudentGroupWithErrorHandling({
        course_instance_id: '1',
        name: 'Unique Group Name',
      });

      assert.isOk(group);
      assert.equal(group.name, 'Unique Group Name');
    });

    it('throws user-friendly error for duplicate names', async () => {
      await createStudentGroup({
        course_instance_id: '1',
        name: 'Duplicate Name',
      });

      try {
        await createStudentGroupWithErrorHandling({
          course_instance_id: '1',
          name: 'Duplicate Name',
        });
        assert.fail('Expected error to be thrown');
      } catch (err: any) {
        assert.equal(err.status, 400);
        assert.include(err.message, 'group with this name already exists');
      }
    });
  });

  describe('createStudentGroupAndAddEnrollments', () => {
    it('creates a group and adds enrollments', async () => {
      const user1 = await getOrCreateUser({
        uid: 'create-enroll-1@example.com',
        name: 'Create Enroll User 1',
        uin: 'ceu1',
        email: 'create-enroll-1@example.com',
      });

      const user2 = await getOrCreateUser({
        uid: 'create-enroll-2@example.com',
        name: 'Create Enroll User 2',
        uin: 'ceu2',
        email: 'create-enroll-2@example.com',
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

      const group = await createStudentGroupAndAddEnrollments({
        course_instance_id: '1',
        name: 'Group With Enrollments',
        enrollment_ids: [enrollment1.id, enrollment2.id],
      });

      assert.equal(group.name, 'Group With Enrollments');

      const enrollments = await selectEnrollmentsInStudentGroup(group.id);
      assert.equal(enrollments.length, 2);
      assert.isTrue(enrollments.some((e) => e.id === enrollment1.id));
      assert.isTrue(enrollments.some((e) => e.id === enrollment2.id));
    });

    it('creates a group with no enrollments when empty array passed', async () => {
      const group = await createStudentGroupAndAddEnrollments({
        course_instance_id: '1',
        name: 'Empty Group',
        enrollment_ids: [],
      });

      assert.equal(group.name, 'Empty Group');

      const enrollments = await selectEnrollmentsInStudentGroup(group.id);
      assert.equal(enrollments.length, 0);
    });
  });
});
