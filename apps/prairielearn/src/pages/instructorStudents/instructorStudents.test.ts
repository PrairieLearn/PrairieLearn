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
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uids: 'blocked_student@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isArray(data.data);
    assert.equal(data.data.length, 1);
    assert.equal(data.data[0].status, 'invited');
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
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uids: 'new_student@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isArray(data.data);
    assert.equal(data.data.length, 1);
    assert.equal(data.data[0].status, 'invited');
    assert.equal(data.data[0].pending_uid, 'new_student@example.com');
  });

  test.sequential('should successfully invite multiple students', async () => {
    await callRow(
      'users_select_or_insert',
      ['bulk_student1@example.com', 'Bulk Student 1', 'bulk1', 'bulk_student1@example.com', 'dev'],
      SprocUsersSelectOrInsertSchema,
    );

    await callRow(
      'users_select_or_insert',
      ['bulk_student2@example.com', 'Bulk Student 2', 'bulk2', 'bulk_student2@example.com', 'dev'],
      SprocUsersSelectOrInsertSchema,
    );

    const response = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uids: 'bulk_student1@example.com,bulk_student2@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isArray(data.data);
    assert.equal(data.data.length, 2);
    assert.equal(data.data[0].status, 'invited');
    assert.equal(data.data[1].status, 'invited');
  });
});

describe('Instructor Students - Check Invitation Endpoint', () => {
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

  test.sequential('should return empty invalidUids for valid users', async () => {
    await callRow(
      'users_select_or_insert',
      ['check_valid@example.com', 'Check Valid', 'checkvalid1', 'check_valid@example.com', 'dev'],
      SprocUsersSelectOrInsertSchema,
    );

    const params = new URLSearchParams({ uids: 'check_valid@example.com' });
    const response = await fetch(`${studentsUrl}/invitation/check?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.invalidUids, []);
  });

  test.sequential('should return invalidUids for non-existent user', async () => {
    const params = new URLSearchParams({ uids: 'nonexistent_check@example.com' });
    const response = await fetch(`${studentsUrl}/invitation/check?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.invalidUids.length, 1);
    assert.equal(data.invalidUids[0].uid, 'nonexistent_check@example.com');
    assert.equal(data.invalidUids[0].reason, 'User not found');
  });

  test.sequential('should return invalidUids for instructor', async () => {
    await callRow(
      'users_select_or_insert',
      [
        'check_instructor@example.com',
        'Check Instructor',
        'checkinst1',
        'check_instructor@example.com',
        'dev',
      ],
      SprocUsersSelectOrInsertSchema,
    );

    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'check_instructor@example.com',
      course_role: 'Viewer',
      authn_user_id: '1',
    });

    const params = new URLSearchParams({ uids: 'check_instructor@example.com' });
    const response = await fetch(`${studentsUrl}/invitation/check?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.invalidUids.length, 1);
    assert.equal(data.invalidUids[0].uid, 'check_instructor@example.com');
    assert.equal(data.invalidUids[0].reason, 'User is an instructor');
  });

  test.sequential('should return invalidUids for enrolled user', async () => {
    const enrolledStudent = await callRow(
      'users_select_or_insert',
      [
        'check_enrolled@example.com',
        'Check Enrolled',
        'checkenrolled1',
        'check_enrolled@example.com',
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

    const params = new URLSearchParams({ uids: 'check_enrolled@example.com' });
    const response = await fetch(`${studentsUrl}/invitation/check?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.invalidUids.length, 1);
    assert.equal(data.invalidUids[0].uid, 'check_enrolled@example.com');
    assert.equal(data.invalidUids[0].reason, 'Already enrolled');
  });

  test.sequential('should return mixed results for multiple UIDs', async () => {
    await callRow(
      'users_select_or_insert',
      [
        'check_mixed_valid@example.com',
        'Check Mixed Valid',
        'checkmixed1',
        'check_mixed_valid@example.com',
        'dev',
      ],
      SprocUsersSelectOrInsertSchema,
    );

    const params = new URLSearchParams({
      uids: 'check_mixed_valid@example.com,check_enrolled@example.com',
    });
    const response = await fetch(`${studentsUrl}/invitation/check?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    // Only check_enrolled should be invalid
    assert.equal(data.invalidUids.length, 1);
    assert.equal(data.invalidUids[0].uid, 'check_enrolled@example.com');
  });
});
