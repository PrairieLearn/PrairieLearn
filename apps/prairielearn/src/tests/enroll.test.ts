import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';
import { z } from 'zod';

import { execute, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type Config, config } from '../lib/config.js';
import { EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';

import * as helperCourse from './helperCourse.js';
import * as helperServer from './helperServer.js';
import {
  createInstitution,
  deleteEnrollmentsInCourseInstance,
  getOrCreateUser,
  updateCourseInstanceSettings,
  withUser,
} from './utils/auth.js';
import { enrollUser, unenrollUser } from './utils/enrollments.js';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const USER_1 = {
  name: 'Student 1',
  uid: 'student1@example.com',
  uin: '1',
  email: 'student1@example.com',
};

const USER_2 = {
  name: 'Student 2',
  uid: 'student2@example.com',
  uin: '2',
  email: 'student2@example.com',
};

const USER_3 = {
  name: 'Student 3',
  uid: 'student3@example.com',
  uin: '3',
  email: 'student3@example.com',
};

describe('Enroll page (enterprise)', function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  const originalIsEnterprise = config.isEnterprise;
  beforeAll(() => (config.isEnterprise = true));
  afterAll(() => (config.isEnterprise = originalIsEnterprise));

  test.sequential('enroll a single student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('enrolls the same student again', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('unenroll a single student', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('unenroll the same student again', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('apply a course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1');
  });

  test.sequential('enroll one student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('fail to enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  test.sequential('apply an institution-level course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1');
    await execute('UPDATE institutions SET course_instance_enrollment_limit = 1 WHERE id = 1');
  });

  test.sequential('fail to enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  test.sequential('set a higher course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 2 WHERE id = 1');
  });

  test.sequential('enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('fail to enroll a third student', async () => {
    const res = await enrollUser('1', USER_3);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  test.sequential('set a yearly enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1');
    await execute(
      'UPDATE institutions SET course_instance_enrollment_limit = 100000, yearly_enrollment_limit = 2 WHERE id = 1',
      {},
    );
  });

  test.sequential('fail to enroll a third student', async () => {
    const res = await enrollUser('1', USER_3);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });
});

// Enrollment limits should not apply for non-enterprise instances (the default).
describe('Enroll page (non-enterprise)', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test.sequential('apply a course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1');
  });

  test.sequential('enroll one student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  // We want to block access in Exam mode since a student could theoretically
  // use the name of a course on the enrollment page to infiltrate information
  // into an exam.
  test.sequential('ensure that access is blocked in Exam mode', async () => {
    const res = await fetch(`${baseUrl}/enroll`, {
      headers: {
        Cookie: 'pl_test_mode=Exam',
      },
    });
    assert.equal(res.status, 403);
  });
});

describe('autoEnroll middleware with institution restrictions', () => {
  let originalIsEnterprise: boolean;

  const courseInstanceUrl = baseUrl + '/course_instance/1';
  const assessmentsUrl = courseInstanceUrl + '/assessments';

  beforeAll(async function () {
    await helperServer.before()();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);

    // Ensure we're not in enterprise mode to avoid enterprise-specific checks
    originalIsEnterprise = config.isEnterprise;
    config.isEnterprise = false;
  });

  afterAll(async function () {
    await helperServer.after();

    // Restore original enterprise setting
    config.isEnterprise = originalIsEnterprise;
  });

  it('allows user from same institution to self-enroll when restrictToInstitution is true', async () => {
    // Clean up any existing enrollments
    await deleteEnrollmentsInCourseInstance('1');

    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Set up course instance with institution restriction enabled
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      restrictToInstitution: true,
    });

    // Create user from same institution
    const sameInstitutionUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Same Institution Student',
      uin: 'same1',
      email: 'student@example.com',
    });

    // Update user's institution to match course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE user_id = $user_id', {
      institution_id: '1',
      user_id: sameInstitutionUser.user_id,
    });

    // Use withUser helper to perform actions as the same institution user
    await withUser(
      {
        uid: sameInstitutionUser.uid,
        name: sameInstitutionUser.name,
        uin: sameInstitutionUser.uin,
        email: sameInstitutionUser.email,
      },
      async () => {
        // Check that user is not enrolled initially
        const initialEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
          { user_id: sameInstitutionUser.user_id, course_instance_id: '1' },
          EnrollmentSchema,
        );
        assert.isNull(initialEnrollment);

        // Hit the assessments endpoint - this should trigger auto-enrollment
        const response = await fetch(assessmentsUrl);
        assert.equal(response.status, 200);

        // Check that user is now enrolled
        const finalEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
          { user_id: sameInstitutionUser.user_id, course_instance_id: '1' },
          EnrollmentSchema,
        );
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.status, 'joined');
      },
    );
  });

  it('blocks user from different institution when restrictToInstitution is true', async () => {
    // Clean up any existing enrollments
    await deleteEnrollmentsInCourseInstance('1');

    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Update the course to belong to institution 2 (different from default institution 1)
    await execute(
      'UPDATE pl_courses SET institution_id = $institution_id WHERE id = (SELECT course_id FROM course_instances WHERE id = $course_instance_id)',
      {
        institution_id: '2',
        course_instance_id: '1',
      },
    );

    // Set up course instance with institution restriction enabled
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      restrictToInstitution: true,
    });

    // Create user from default institution (institution 1)
    const defaultInstitutionUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Default Institution Student',
      uin: 'default1',
      email: 'student@example.com',
    });

    // Use withUser helper to perform actions as the default institution user
    await withUser(
      {
        uid: defaultInstitutionUser.uid,
        name: defaultInstitutionUser.name,
        uin: defaultInstitutionUser.uin,
        email: defaultInstitutionUser.email,
      },
      async () => {
        // Check that user is not enrolled initially
        const initialEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
          { user_id: defaultInstitutionUser.user_id, course_instance_id: '1' },
          EnrollmentSchema,
        );
        assert.isNull(initialEnrollment);

        // Hit the assessments endpoint - this should NOT trigger auto-enrollment
        const response = await fetch(assessmentsUrl);

        // Check that user is still not enrolled
        const finalEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
          { user_id: defaultInstitutionUser.user_id, course_instance_id: '1' },
          EnrollmentSchema,
        );

        assert.equal(response.status, 403);
        assert.isNull(finalEnrollment);
      },
    );
  });

  it('allows user from different institution when restrictToInstitution is false', async () => {
    // Clean up any existing enrollments
    await deleteEnrollmentsInCourseInstance('1');

    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Set up course instance with institution restriction disabled
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      restrictToInstitution: false,
    });

    // Create user from different institution
    const differentInstitutionUser = await getOrCreateUser({
      uid: 'student@other.com',
      name: 'Different Institution Student',
      uin: 'diff1',
      email: 'student@other.com',
    });

    // Update user's institution to be different from course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE user_id = $user_id', {
      institution_id: '2',
      user_id: differentInstitutionUser.user_id,
    });

    // Use withUser helper to perform actions as the different institution user
    await withUser(
      {
        uid: differentInstitutionUser.uid,
        name: differentInstitutionUser.name,
        uin: differentInstitutionUser.uin,
        email: differentInstitutionUser.email,
      },
      async () => {
        // Check that user is not enrolled initially
        const initialEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
          { user_id: differentInstitutionUser.user_id, course_instance_id: '1' },
          EnrollmentSchema,
        );
        assert.isNull(initialEnrollment);

        // Hit the assessments endpoint - this should trigger auto-enrollment
        const response = await fetch(assessmentsUrl);
        assert.equal(response.status, 200);

        // Check that user is now enrolled
        const finalEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
          { user_id: differentInstitutionUser.user_id, course_instance_id: '1' },
          EnrollmentSchema,
        );
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.status, 'joined');
      },
    );
  });

  it('allows invited user from different institution to enroll even when restrictToInstitution is true', async () => {
    // Clean up any existing enrollments
    await deleteEnrollmentsInCourseInstance('1');

    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Set up course instance with institution restriction enabled
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      restrictToInstitution: true,
    });

    // Create user from different institution
    const differentInstitutionUser = await getOrCreateUser({
      uid: 'invited@other.com',
      name: 'Invited Different Institution Student',
      uin: 'invited1',
      email: 'invited@other.com',
    });

    // Update user's institution to be different from course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE user_id = $user_id', {
      institution_id: '2',
      user_id: differentInstitutionUser.user_id,
    });

    // Create an invited enrollment for the user
    await queryRow(
      `INSERT INTO enrollments (user_id, course_instance_id, status, pending_uid)
       VALUES (NULL, $course_instance_id, 'invited', $pending_uid)
       RETURNING *`,
      {
        course_instance_id: '1',
        pending_uid: differentInstitutionUser.uid,
      },
      EnrollmentSchema,
    );

    // Use withUser helper to perform actions as the invited user
    await withUser(
      {
        uid: differentInstitutionUser.uid,
        name: differentInstitutionUser.name,
        uin: differentInstitutionUser.uin,
        email: differentInstitutionUser.email,
      },
      async () => {
        // Check that user has an invited enrollment initially
        const initialEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE pending_uid = $pending_uid AND course_instance_id = $course_instance_id',
          { pending_uid: differentInstitutionUser.uid, course_instance_id: '1' },
          EnrollmentSchema,
        );
        assert.isNotNull(initialEnrollment);
        assert.equal(initialEnrollment.status, 'invited');

        // Hit the assessments endpoint - this should convert invited enrollment to joined
        const response = await fetch(assessmentsUrl);
        assert.equal(response.status, 200);

        // Check that user is now enrolled (invited enrollment should be converted to joined)
        const finalEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
          { user_id: differentInstitutionUser.user_id, course_instance_id: '1' },
          EnrollmentSchema,
        );
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.status, 'joined');
        assert.isNull(finalEnrollment.pending_uid);

        // Check that the invited enrollment is gone
        const invitedEnrollment = await queryOptionalRow(
          'SELECT * FROM enrollments WHERE pending_uid = $pending_uid AND course_instance_id = $course_instance_id',
          { pending_uid: differentInstitutionUser.uid, course_instance_id: '1' },
          EnrollmentSchema,
        );
        assert.isNull(invitedEnrollment);
      },
    );
  });
});
