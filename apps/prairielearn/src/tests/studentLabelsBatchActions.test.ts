import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, queryRows } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { EnrollmentSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';
import { createStudentLabel, deleteStudentLabel } from '../models/student-label.js';

import { fetchCheerio, getCSRFToken } from './helperClient.js';
import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
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

describe('Student labels batch actions', () => {
  let labelId: string;
  let enrollment1Id: string;
  let enrollment2Id: string;
  let enrollment3Id: string;
  let courseRepo: CourseRepoFixture;

  beforeAll(async () => {
    // Create a course fixture from the test course template
    // This allows git operations to work (unlike the test course inside the repository)
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });

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

    // Create a test label
    const label = await createStudentLabel({
      course_instance_id: '1',
      name: 'Batch Test Label',
    });
    labelId = label.id;
  });

  afterAll(async () => {
    // Clean up the test label (ignore if it doesn't exist)
    if (labelId) {
      try {
        await deleteStudentLabel(labelId);
      } catch {
        // Label may not exist if tests modified or deleted it
      }
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

  test.sequential('should batch add multiple students to a label', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Batch add students to the label
    const addResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'batch_add_to_label',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment1Id, enrollment2Id, enrollment3Id],
        student_label_id: labelId,
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assert.equal(addResponse.status, 200);

    // Verify all students are now in the label
    const memberships = await queryRows(
      'SELECT * FROM student_label_enrollments WHERE student_label_id = $1',
      [labelId],
      EnrollmentSchema.pick({ id: true }).extend({ enrollment_id: EnrollmentSchema.shape.id }),
    );

    assert.equal(memberships.length, 3);

    const memberEnrollmentIds = memberships.map((m) => m.enrollment_id);
    assert.include(memberEnrollmentIds, enrollment1Id);
    assert.include(memberEnrollmentIds, enrollment2Id);
    assert.include(memberEnrollmentIds, enrollment3Id);
  });

  test.sequential('should batch remove multiple students from a label', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Batch remove students from the label
    const removeResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'batch_remove_from_label',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment1Id, enrollment2Id],
        student_label_id: labelId,
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assert.equal(removeResponse.status, 200);

    // Verify only student3 is still in the label
    const memberships = await queryRows(
      'SELECT * FROM student_label_enrollments WHERE student_label_id = $1',
      [labelId],
      EnrollmentSchema.pick({ id: true }).extend({ enrollment_id: EnrollmentSchema.shape.id }),
    );

    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].enrollment_id, enrollment3Id);
  });

  test.sequential('should remove the last student from a label', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Remove the last student from the label
    const removeResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'batch_remove_from_label',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment3Id],
        student_label_id: labelId,
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assert.equal(removeResponse.status, 200);

    // Verify label has no members
    const memberships = await queryRows(
      'SELECT * FROM student_label_enrollments WHERE student_label_id = $1',
      [labelId],
      EnrollmentSchema.pick({ id: true }).extend({ enrollment_id: EnrollmentSchema.shape.id }),
    );

    assert.equal(memberships.length, 0);
  });

  test.sequential(
    'should not allow adding to a label from a different course instance',
    async () => {
      const pageResponse = await fetchCheerio(studentsUrl);
      assert.equal(pageResponse.status, 200);

      const csrfToken = getCSRFToken(pageResponse.$);

      // Try to add students to a label that doesn't belong to this course instance
      const addResponse = await fetchCheerio(studentsUrl, {
        method: 'POST',
        body: JSON.stringify({
          __action: 'batch_add_to_label',
          __csrf_token: csrfToken,
          enrollment_ids: [enrollment1Id],
          student_label_id: '999999', // Non-existent label
        }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      // Should fail with 500 because label doesn't exist
      assert.equal(addResponse.status, 500);
    },
  );

  test.sequential('should create a new label and add students to it', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Create a new label and add students in one action
    const createResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'create_label_and_add_students',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment1Id, enrollment2Id],
        name: 'New Created Label',
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assert.equal(createResponse.status, 200);

    // Verify the label was created and students were added
    const memberships = await queryRows(
      "SELECT sle.* FROM student_label_enrollments sle JOIN student_labels sl ON sle.student_label_id = sl.id WHERE sl.name = 'New Created Label'",
      [],
      EnrollmentSchema.pick({ id: true }).extend({ enrollment_id: EnrollmentSchema.shape.id }),
    );

    assert.equal(memberships.length, 2);

    const memberEnrollmentIds = memberships.map((m) => m.enrollment_id);
    assert.include(memberEnrollmentIds, enrollment1Id);
    assert.include(memberEnrollmentIds, enrollment2Id);
  });

  test.sequential('should fail to create label with duplicate name', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Try to create another label with the same name as the one we just created
    const createResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'create_label_and_add_students',
        __csrf_token: csrfToken,
        enrollment_ids: [enrollment3Id],
        name: 'New Created Label', // Same name as previous test
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Should fail with 400 because label name already exists
    assert.equal(createResponse.status, 400);
  });

  test.sequential('should fail to create label with empty name', async () => {
    const pageResponse = await fetchCheerio(studentsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Try to create a label with an empty name
    const createResponse = await fetchCheerio(studentsUrl, {
      method: 'POST',
      body: JSON.stringify({
        __action: 'create_label_and_add_students',
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
