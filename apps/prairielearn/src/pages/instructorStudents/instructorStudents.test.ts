import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { callRow, execute, queryRow } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { EnrollmentSchema, SprocUsersSelectOrInsertSchema } from '../../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../../models/course-permissions.js';
import { fetchCheerio } from '../../tests/helperClient.js';
import * as helperCourse from '../../tests/helperCourse.js';
import * as helperServer from '../../tests/helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const instructorHeaders = { cookie: 'pl_test_user=test_instructor' };
const studentsUrl = `${baseUrl}/course_instance/1/instructor/instance_admin/students`;

describe('Instructor Students - Invite by UID', () => {
  let csrfToken: string;

  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  beforeAll(async () => {
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);

    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$' WHERE id = 1");

    await callRow(
      'users_select_or_insert',
      ['instructor@example.com', 'Test Instructor', 'instructor1', 'instructor@example.com', 'dev'],
      SprocUsersSelectOrInsertSchema,
    );

    const instructor = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });

    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: instructor.user_id,
      course_instance_role: 'Student Data Editor',
      authn_user_id: '1',
    });

    const response = await fetchCheerio(studentsUrl, {
      headers: instructorHeaders,
    });
    assert.equal(response.status, 200);
    csrfToken = response.$('span#test_csrf_token').text();
    assert.isString(csrfToken);
  });

  test.sequential('should return error when user does not exist', async () => {
    const response = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uid: 'nonexistent@example.com',
      }),
    });

    assert.equal(response.status, 400);
    const data = await response.json();
    assert.equal(data.error, 'User not found');
  });

  test.sequential('should return error when user is an instructor', async () => {
    await callRow(
      'users_select_or_insert',
      [
        'another_instructor@example.com',
        'Another Instructor',
        'instructor2',
        'another_instructor@example.com',
        'dev',
      ],
      SprocUsersSelectOrInsertSchema,
    );

    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'another_instructor@example.com',
      course_role: 'Viewer',
      authn_user_id: '1',
    });

    const response = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uid: 'another_instructor@example.com',
      }),
    });

    assert.equal(response.status, 400);
    const data = await response.json();
    assert.equal(data.error, 'The user is an instructor');
  });

  test.sequential('should successfully invite a blocked user', async () => {
    const blockedStudent = await callRow(
      'users_select_or_insert',
      [
        'blocked_student@example.com',
        'Blocked Student',
        'blocked1',
        'blocked_student@example.com',
        'dev',
      ],
      SprocUsersSelectOrInsertSchema,
    );

    await queryRow(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'blocked', NOW())
       RETURNING *`,
      {
        user_id: blockedStudent.user_id,
        course_instance_id: '1',
      },
      EnrollmentSchema,
    );

    const response = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uid: 'blocked_student@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isTrue(data.ok);
    assert.isObject(data.data);
    assert.equal(data.data.status, 'invited');
  });

  test.sequential('should successfully invite a new student', async () => {
    await callRow(
      'users_select_or_insert',
      ['new_student@example.com', 'New Student', 'new1', 'new_student@example.com', 'dev'],
      SprocUsersSelectOrInsertSchema,
    );

    const response = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uid: 'new_student@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isTrue(data.ok);
    assert.isObject(data.data);
    assert.equal(data.data.status, 'invited');
    assert.equal(data.data.pending_uid, 'new_student@example.com');
  });

  test.sequential('should return error when user is already enrolled', async () => {
    const enrolledStudent = await callRow(
      'users_select_or_insert',
      [
        'enrolled_student@example.com',
        'Enrolled Student',
        'enrolled1',
        'enrolled_student@example.com',
        'dev',
      ],
      SprocUsersSelectOrInsertSchema,
    );

    await queryRow(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'joined', NOW())
       RETURNING *`,
      {
        user_id: enrolledStudent.user_id,
        course_instance_id: '1',
      },
      EnrollmentSchema,
    );

    const response = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uid: 'enrolled_student@example.com',
      }),
    });

    assert.equal(response.status, 400);
    const data = await response.json();
    assert.equal(data.error, 'The user is already enrolled');
  });

  test.sequential('should return error when user has an existing invitation', async () => {
    // Create a student user
    await callRow(
      'users_select_or_insert',
      [
        'previously_invited_student@example.com',
        'Previously Invited Student',
        'invited1',
        'previously_invited_student@example.com',
        'dev',
      ],
      SprocUsersSelectOrInsertSchema,
    );

    await queryRow(
      `INSERT INTO enrollments (course_instance_id, status, pending_uid)
       VALUES ($course_instance_id, 'invited', $pending_uid)
       RETURNING *`,
      {
        course_instance_id: '1',
        pending_uid: 'previously_invited_student@example.com',
      },
      EnrollmentSchema,
    );

    const response = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uid: 'previously_invited_student@example.com',
      }),
    });

    assert.equal(response.status, 400);
    const data = await response.json();
    assert.equal(data.error, 'The user has an existing invitation');
  });
});
