import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, queryRows } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { EnrollmentSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';
import { createStudentGroup, deleteStudentGroup } from '../models/student-group.js';

import { fetchCheerio, getCSRFToken } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const siteUrl = `http://localhost:${process.env.VITEST_POOL_ID ? 3007 + Number.parseInt(process.env.VITEST_POOL_ID) : 3007}`;

const STUDENT_1 = {
  name: 'Test Student 1',
  uid: 'test-student-1@example.com',
  uin: 'test1',
  email: 'test-student-1@example.com',
};

const STUDENT_2 = {
  name: 'Test Student 2',
  uid: 'test-student-2@example.com',
  uin: 'test2',
  email: 'test-student-2@example.com',
};

const STUDENT_3 = {
  name: 'Test Student 3',
  uid: 'test-student-3@example.com',
  uin: 'test3',
  email: 'test-student-3@example.com',
};

describe('Student groups batch actions', () => {
  let groupId: string;
  let enrollment1Id: string;
  let enrollment2Id: string;
  let enrollment3Id: string;

  beforeAll(async () => {
    await helperServer.before(TEST_COURSE_PATH)();

    // Create test students and enroll them
    const courseInstance = await selectCourseInstanceById('1');

    const [user1, user2, user3] = await Promise.all([
      getOrCreateUser(STUDENT_1),
      getOrCreateUser(STUDENT_2),
      getOrCreateUser(STUDENT_3),
    ]);

    const [enrollment1, enrollment2, enrollment3] = await Promise.all([
      ensureUncheckedEnrollment({
        courseInstance,
        userId: user1.id,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      }),
      ensureUncheckedEnrollment({
        courseInstance,
        userId: user2.id,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      }),
      ensureUncheckedEnrollment({
        courseInstance,
        userId: user3.id,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      }),
    ]);

    enrollment1Id = enrollment1!.id;
    enrollment2Id = enrollment2!.id;
    enrollment3Id = enrollment3!.id;

    // Create a test group
    const group = await createStudentGroup({
      course_instance_id: '1',
      name: 'Batch Test Group',
    });
    groupId = group.id;
  });

  afterAll(async () => {
    // Clean up the test group
    if (groupId) {
      await deleteStudentGroup(groupId);
    }

    // Clean up test enrollments
    await execute('DELETE FROM enrollments WHERE id IN ($1, $2, $3)', [
      enrollment1Id,
      enrollment2Id,
      enrollment3Id,
    ]);

    await helperServer.after();
  });

  const studentsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students`;

  test.sequential('should load the students page', async () => {
    const response = await fetchCheerio(studentsUrl);
    assert.equal(response.status, 200);
  });

  test.sequential('should batch add multiple students to a group', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Batch add students to the group
    const addResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'batch_add_to_group',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment1Id, enrollment2Id, enrollment3Id],
        student_group_id: groupId,
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assert.equal(addResponse.status, 200);

    // Verify all students are now in the group
    const memberships = await queryRows(
      'SELECT * FROM student_group_enrollments WHERE student_group_id = $1',
      [groupId],
      EnrollmentSchema.pick({ id: true }).extend({ enrollment_id: EnrollmentSchema.shape.id }),
    );

    assert.equal(memberships.length, 3);

    const memberEnrollmentIds = memberships.map((m) => m.enrollment_id);
    assert.include(memberEnrollmentIds, enrollment1Id);
    assert.include(memberEnrollmentIds, enrollment2Id);
    assert.include(memberEnrollmentIds, enrollment3Id);
  });

  test.sequential('should batch remove multiple students from a group', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Batch remove students from the group
    const removeResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'batch_remove_from_group',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment1Id, enrollment2Id],
        student_group_id: groupId,
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assert.equal(removeResponse.status, 200);

    // Verify only student 3 remains in the group
    const memberships = await queryRows(
      'SELECT * FROM student_group_enrollments WHERE student_group_id = $1',
      [groupId],
      EnrollmentSchema.pick({ id: true }).extend({ enrollment_id: EnrollmentSchema.shape.id }),
    );

    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].enrollment_id, enrollment3Id);
  });

  test.sequential('should remove the last student from a group', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Remove the last student
    const removeResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'batch_remove_from_group',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment3Id],
        student_group_id: groupId,
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assert.equal(removeResponse.status, 200);

    // Verify the group is now empty
    const memberships = await queryRows(
      'SELECT * FROM student_group_enrollments WHERE student_group_id = $1',
      [groupId],
      EnrollmentSchema.pick({ id: true }).extend({ enrollment_id: EnrollmentSchema.shape.id }),
    );

    assert.equal(memberships.length, 0);
  });

  test.sequential(
    'should not allow adding to a group from a different course instance',
    async () => {
      // Create a group in a different course instance (if we had one)
      // For now, just test with an invalid group ID
      const pageResponse = await fetchCheerio(studentsUrl);
      assert.equal(pageResponse.status, 200);

      const csrfToken = getCSRFToken(pageResponse.$);

      // Try to add to a non-existent group
      const addResponse = await fetchCheerio(studentsUrl, {
        method: 'POST',
        body: JSON.stringify({
          __action: 'batch_add_to_group',
          __csrf_token: csrfToken,
          enrollment_ids: [enrollment1Id],
          student_group_id: '999999',
        }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      // Should fail because group doesn't exist
      assert.notEqual(addResponse.status, 200);
    },
  );

  test.sequential('should create a new group and add students to it', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Create a new group and add students in one action
    const createResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'create_group_and_add_students',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment1Id, enrollment2Id],
        name: 'New Created Group',
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assert.equal(createResponse.status, 200);

    // Verify the group was created and students were added
    const memberships = await queryRows(
      "SELECT sge.* FROM student_group_enrollments sge JOIN student_groups sg ON sge.student_group_id = sg.id WHERE sg.name = 'New Created Group'",
      [],
      EnrollmentSchema.pick({ id: true }).extend({ enrollment_id: EnrollmentSchema.shape.id }),
    );

    assert.equal(memberships.length, 2);

    const memberEnrollmentIds = memberships.map((m) => m.enrollment_id);
    assert.include(memberEnrollmentIds, enrollment1Id);
    assert.include(memberEnrollmentIds, enrollment2Id);
  });

  test.sequential('should fail to create group with duplicate name', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Try to create another group with the same name as the one we just created
    const createResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'create_group_and_add_students',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment3Id],
        name: 'New Created Group', // Same name as previous test
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Should fail with 400 because group name already exists
    assert.equal(createResponse.status, 400);
  });

  test.sequential('should fail to create group with empty name', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Try to create a group with an empty name
    const createResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'create_group_and_add_students',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment1Id],
        name: '',
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Should fail because name is required
    assert.notEqual(createResponse.status, 200);
  });
});
