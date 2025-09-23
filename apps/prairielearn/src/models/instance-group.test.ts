import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';

import { EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import {
  addEnrollmentToInstanceGroup,
  createInstanceGroup,
  deleteInstanceGroup,
  removeEnrollmentFromInstanceGroup,
  renameInstanceGroup,
  selectEnrollmentsInInstanceGroup,
  selectInstanceGroupById,
  selectInstanceGroupsByCourseInstance,
  selectInstanceGroupsForEnrollment,
} from './instance-group.js';

describe('Instance Group Model', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
  });

  afterEach(async function () {
    await helperDb.after();
  });

  describe('createInstanceGroup', () => {
    it('creates instance groups', async () => {
      const group1 = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Group 1',
      });

      const group2 = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Group 2',
      });

      assert.notEqual(group1.id, group2.id);
      assert.equal(group1.course_instance_id, group2.course_instance_id);
      assert.equal(group1.name, 'Group 1');
      assert.equal(group2.name, 'Group 2');
    });
  });

  describe('selectInstanceGroupsByCourseInstance', () => {
    it('returns empty array when no instance groups exist', async () => {
      const groups = await selectInstanceGroupsByCourseInstance('1');
      assert.equal(groups.length, 0);
    });

    it('returns all instance groups for a course instance', async () => {
      await createInstanceGroup({
        course_instance_id: '1',
        name: 'Group A',
      });

      await createInstanceGroup({
        course_instance_id: '1',
        name: 'Group B',
      });

      await createInstanceGroup({
        course_instance_id: '1',
        name: 'Group C',
      });

      const groups = await selectInstanceGroupsByCourseInstance('1');
      assert.equal(groups.length, 3);
      assert.equal(groups[0].name, 'Group A');
      assert.equal(groups[1].name, 'Group B');
      assert.equal(groups[2].name, 'Group C');
    });

    it('excludes soft-deleted instance groups', async () => {
      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await deleteInstanceGroup(group.id);

      const groups = await selectInstanceGroupsByCourseInstance('1');
      assert.equal(groups.length, 0);
    });
  });

  describe('selectInstanceGroupById', () => {
    it('returns instance group by id', async () => {
      const createdGroup = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      const retrievedGroup = await selectInstanceGroupById(createdGroup.id);
      assert.equal(retrievedGroup.id, createdGroup.id);
      assert.equal(retrievedGroup.name, 'Test Group');
      assert.equal(retrievedGroup.course_instance_id, '1');
    });

    it('throws an error retrieving a non-existent instance group', async () => {
      try {
        await selectInstanceGroupById('999999');
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }

      // Soft deleted group
      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await deleteInstanceGroup(group.id);

      try {
        await selectInstanceGroupById(group.id);
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }
    });
  });

  describe('renameInstanceGroup', () => {
    it('renames an instance group', async () => {
      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Old Name',
      });

      const renamedGroup = await renameInstanceGroup({
        id: group.id,
        name: 'New Name',
      });

      assert.equal(renamedGroup.id, group.id);
      assert.equal(renamedGroup.name, 'New Name');
      assert.equal(renamedGroup.course_instance_id, group.course_instance_id);
    });

    it('throws error when renaming non-existent instance group', async () => {
      try {
        await renameInstanceGroup({
          id: '999999',
          name: 'New Name',
        });
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }
    });
  });

  describe('deleteInstanceGroup', () => {
    it('throws error when deleting non-existent instance group', async () => {
      try {
        await deleteInstanceGroup('999999');
        assert.fail('Expected error to be thrown');
      } catch (err) {
        assert.isTrue(err instanceof Error);
      }
    });
  });

  describe('addEnrollmentToInstanceGroup', () => {
    it('adds enrollment to instance group', async () => {
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
          user_id: user.user_id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      const enrollmentGroup = await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment.id,
        instance_group_id: group.id,
      });

      assert.isNotNull(enrollmentGroup);
      assert.equal(enrollmentGroup.enrollment_id, enrollment.id);
      assert.equal(enrollmentGroup.instance_group_id, group.id);
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
          user_id: user.user_id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment.id,
        instance_group_id: group.id,
      });

      const result = await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment.id,
        instance_group_id: group.id,
      });

      assert.isNull(result);
    });
  });

  describe('removeEnrollmentFromInstanceGroup', () => {
    it('removes enrollment from instance group', async () => {
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
          user_id: user.user_id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment.id,
        instance_group_id: group.id,
      });

      await removeEnrollmentFromInstanceGroup({
        enrollment_id: enrollment.id,
        instance_group_id: group.id,
      });

      const enrollments = await selectEnrollmentsInInstanceGroup(group.id);
      assert.equal(enrollments.length, 0);
    });
  });

  describe('selectEnrollmentsInInstanceGroup', () => {
    it('returns enrollments in instance group', async () => {
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
          user_id: user1.user_id,
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
          user_id: user2.user_id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment1.id,
        instance_group_id: group.id,
      });

      await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment2.id,
        instance_group_id: group.id,
      });

      const enrollments = await selectEnrollmentsInInstanceGroup(group.id);
      assert.equal(enrollments.length, 2);
      assert.isTrue(enrollments.some((e) => e.id === enrollment1.id));
      assert.isTrue(enrollments.some((e) => e.id === enrollment2.id));
    });

    it('returns empty array when no enrollments in group', async () => {
      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Empty Group',
      });

      const enrollments = await selectEnrollmentsInInstanceGroup(group.id);
      assert.equal(enrollments.length, 0);
    });
  });

  describe('selectInstanceGroupsForEnrollment', () => {
    it('returns instance groups for enrollment', async () => {
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
          user_id: user.user_id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const group1 = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Group A',
      });

      const group2 = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Group B',
      });

      await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment.id,
        instance_group_id: group1.id,
      });

      await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment.id,
        instance_group_id: group2.id,
      });

      const groups = await selectInstanceGroupsForEnrollment(enrollment.id);
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
          user_id: user.user_id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const groups = await selectInstanceGroupsForEnrollment(enrollment.id);
      assert.equal(groups.length, 0);
    });

    it('excludes soft-deleted instance groups', async () => {
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
          user_id: user.user_id,
          course_instance_id: '1',
          first_joined_at: new Date(),
        },
        EnrollmentSchema,
      );

      const group = await createInstanceGroup({
        course_instance_id: '1',
        name: 'Test Group',
      });

      await addEnrollmentToInstanceGroup({
        enrollment_id: enrollment.id,
        instance_group_id: group.id,
      });

      await deleteInstanceGroup(group.id);

      const groups = await selectInstanceGroupsForEnrollment(enrollment.id);
      assert.equal(groups.length, 0);
    });
  });
});
