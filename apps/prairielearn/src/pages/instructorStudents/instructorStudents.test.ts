import stripAnsi from 'strip-ansi';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { callRow, execute, queryRow } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { EnrollmentSchema, SprocUsersSelectOrInsertSchema } from '../../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { getJobSequence } from '../../lib/server-jobs.js';
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

  test.sequential('should successfully invite a nonexistent user', async () => {
    const response = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_uids',
        __csrf_token: csrfToken,
        uids: 'nonexistent@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isString(data.job_sequence_id);

    await helperServer.waitForJobSequenceSuccess(data.job_sequence_id);

    const jobSequence = await getJobSequence(data.job_sequence_id, '1');
    assert.equal(jobSequence.status, 'Success');
    assert.lengthOf(jobSequence.jobs, 1);

    const job = jobSequence.jobs[0];
    const output = stripAnsi(job.output ?? '');
    assert.equal(
      output,
      `nonexistent@example.com: Invited
\nSummary:
  Successfully invited: 1\n`,
    );
  });

  test.sequential('should skip when user is an instructor', async () => {
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
        Accept: 'application/json',
        cookie: instructorHeaders.cookie,
      },
      body: new URLSearchParams({
        __action: 'invite_uids',
        __csrf_token: csrfToken,
        uids: 'another_instructor@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isString(data.job_sequence_id);

    await helperServer.waitForJobSequenceSuccess(data.job_sequence_id);

    const jobSequence = await getJobSequence(data.job_sequence_id, '1');
    assert.equal(jobSequence.status, 'Success');

    const job = jobSequence.jobs[0];
    const output = stripAnsi(job.output ?? '');
    assert.equal(
      output,
      `another_instructor@example.com: Skipped (instructor)
\nSummary:
  Successfully invited: 0
  Instructors (skipped): 1\n`,
    );
  });

  test.sequential('should skip when trying to invite a blocked user', async () => {
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
        __action: 'invite_uids',
        __csrf_token: csrfToken,
        uids: 'blocked_student@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isString(data.job_sequence_id);

    await helperServer.waitForJobSequenceSuccess(data.job_sequence_id);

    const jobSequence = await getJobSequence(data.job_sequence_id, '1');
    assert.equal(jobSequence.status, 'Success');

    const job = jobSequence.jobs[0];
    const output = stripAnsi(job.output ?? '');
    assert.equal(
      output,
      `blocked_student@example.com: Skipped (blocked)
\nSummary:
  Successfully invited: 0
  Blocked (skipped): 1\n`,
    );
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
        __action: 'invite_uids',
        __csrf_token: csrfToken,
        uids: 'new_student@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isString(data.job_sequence_id);

    await helperServer.waitForJobSequenceSuccess(data.job_sequence_id);

    const jobSequence = await getJobSequence(data.job_sequence_id, '1');
    assert.equal(jobSequence.status, 'Success');

    const job = jobSequence.jobs[0];
    const output = stripAnsi(job.output ?? '');
    assert.equal(
      output,
      `new_student@example.com: Invited
\nSummary:
  Successfully invited: 1\n`,
    );
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
        __action: 'invite_uids',
        __csrf_token: csrfToken,
        uids: 'bulk_student1@example.com,bulk_student2@example.com',
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.isString(data.job_sequence_id);

    await helperServer.waitForJobSequenceSuccess(data.job_sequence_id);

    const jobSequence = await getJobSequence(data.job_sequence_id, '1');
    assert.equal(jobSequence.status, 'Success');

    const job = jobSequence.jobs[0];
    const output = stripAnsi(job.output ?? '');
    assert.equal(
      output,
      `bulk_student1@example.com: Invited
bulk_student2@example.com: Invited
\nSummary:
  Successfully invited: 2\n`,
    );
  });
});
