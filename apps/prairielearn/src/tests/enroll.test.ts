import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';

import { execute } from '@prairielearn/postgres';

import { getSelfEnrollmentLinkUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import {
  selectOptionalEnrollmentByPendingUid,
  selectOptionalEnrollmentByUserId,
} from '../models/enrollment.js';

import * as helperCourse from './helperCourse.js';
import * as helperServer from './helperServer.js';
import {
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
    assert.equal(res.url, siteUrl + '/');
  });

  test.sequential('unenroll the same student again', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, siteUrl + '/');
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

describe('Enrollment transitions', () => {
  let courseInstanceCode: string | null = null;

  const courseInstanceUrl = baseUrl + '/course_instance/1';
  const assessmentsUrl = courseInstanceUrl + '/assessments';

  beforeAll(async function () {
    await helperServer.before()();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);

    const instance = await selectOptionalCourseInstanceById('1');
    assert.isNotNull(instance);
    courseInstanceCode = instance.enrollment_code;

    // Set uid_regexp for the default institution to allow @example.com UIDs
    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$' WHERE id = 1");
  });

  afterAll(async function () {
    await helperServer.after();
  });

  it('does not allow user to self-enroll via the assessments endpoint when self-enrollment is disabled', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: false,
    });

    const studentUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student1',
      email: 'student@example.com',
      institutionId: '1',
    });

    await withUser(
      {
        uid: studentUser.uid,
        name: studentUser.name,
        uin: studentUser.uin,
        email: studentUser.email,
      },
      async () => {
        // Check that user is not enrolled initially
        const initialEnrollment = await selectOptionalEnrollmentByUserId({
          user_id: studentUser.user_id,
          course_instance_id: '1',
        });
        assert.isNull(initialEnrollment);

        // Enroll user via the assessments endpoint
        const response = await fetch(assessmentsUrl);
        assert.equal(response.status, 403);

        // Check that user is now enrolled
        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          user_id: studentUser.user_id,
          course_instance_id: '1',
        });
        assert.isNull(finalEnrollment);
      },
    );
  });

  it('allows user to self-enroll via the assessments endpoint when self-enrollment is enabled', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: false,
    });

    const studentUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student1',
      email: 'student@example.com',
      institutionId: '1',
    });

    await withUser(
      {
        uid: studentUser.uid,
        name: studentUser.name,
        uin: studentUser.uin,
        email: studentUser.email,
      },
      async () => {
        // Check that user is not enrolled initially
        const initialEnrollment = await selectOptionalEnrollmentByUserId({
          user_id: studentUser.user_id,
          course_instance_id: '1',
        });
        assert.isNull(initialEnrollment);

        // Enroll user via the assessments endpoint
        const response = await fetch(assessmentsUrl);
        assert.equal(response.status, 200);

        // Check that user is now enrolled
        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          user_id: studentUser.user_id,
          course_instance_id: '1',
        });
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.status, 'joined');
      },
    );
  });

  it('allows invited user to self-enroll via the assessments endpoint when self-enrollment is disabled', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: false,
    });

    const invitedUser = await getOrCreateUser({
      uid: 'invited@example.com',
      name: 'Invited Student',
      uin: 'invited1',
      email: 'invited@example.com',
      institutionId: '1',
    });

    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uid)
       VALUES ($course_instance_id, 'invited', $pending_uid)`,
      {
        course_instance_id: '1',
        pending_uid: invitedUser.uid,
      },
    );

    await withUser(
      {
        uid: invitedUser.uid,
        name: invitedUser.name,
        uin: invitedUser.uin,
        email: invitedUser.email,
      },
      async () => {
        const initialEnrollment = await selectOptionalEnrollmentByPendingUid({
          pending_uid: invitedUser.uid,
          course_instance_id: '1',
        });
        assert.isNotNull(initialEnrollment);
        assert.equal(initialEnrollment.status, 'invited');

        const response = await fetch(assessmentsUrl);
        assert.equal(response.status, 200);

        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          user_id: invitedUser.user_id,
          course_instance_id: '1',
        });
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.status, 'joined');
        assert.isNull(finalEnrollment.pending_uid);
      },
    );
  });

  it('does not allow blocked user to self-enroll via the assessments endpoint', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: false,
    });

    const blockedUser = await getOrCreateUser({
      uid: 'blocked@example.com',
      name: 'Blocked Student',
      uin: 'blocked1',
      email: 'blocked@example.com',
      institutionId: '1',
    });

    await execute(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'blocked', $first_joined_at)`,
      {
        user_id: blockedUser.user_id,
        course_instance_id: '1',
        first_joined_at: new Date(),
      },
    );

    await withUser(
      {
        uid: blockedUser.uid,
        name: blockedUser.name,
        uin: blockedUser.uin,
        email: blockedUser.email,
      },
      async () => {
        // Check that user got a 403 for blocked users
        const response = await fetch(assessmentsUrl);
        assert.equal(response.status, 403);

        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          user_id: blockedUser.user_id,
          course_instance_id: '1',
        });
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.status, 'blocked');
      },
    );
  });

  it('redirects to join page when enrollment code is required and user goes to assessments endpoint', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: true,
    });

    const studentUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student1',
      email: 'student@example.com',
      institutionId: '1',
    });

    await withUser(
      {
        uid: studentUser.uid,
        name: studentUser.name,
        uin: studentUser.uin,
        email: studentUser.email,
      },
      async () => {
        // Check the user got redirected to the join page
        const response = await fetch(assessmentsUrl, { redirect: 'manual' });
        assert.equal(response.status, 302);
        assert.isTrue(response.headers.get('location')?.includes('/join'));

        // Check that user is still not enrolled
        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          user_id: studentUser.user_id,
          course_instance_id: '1',
        });
        assert.isNull(finalEnrollment);
      },
    );
  });

  it('redirects and enrolls user when enrollment code is required and user goes to self-enrollment link', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: true,
    });

    const studentUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student1',
      email: 'student@example.com',
      institutionId: '1',
    });

    await withUser(
      {
        uid: studentUser.uid,
        name: studentUser.name,
        uin: studentUser.uin,
        email: studentUser.email,
      },
      async () => {
        // Check the user got redirected to the assessments page
        const response = await fetch(
          siteUrl +
            getSelfEnrollmentLinkUrl({
              courseInstanceId: '1',
              enrollmentCode: courseInstanceCode!,
            }),
          { redirect: 'manual' },
        );
        assert.equal(response.status, 302);
        assert.isTrue(response.headers.get('location')?.includes('/assessments'));

        // Check that user is now enrolled
        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          user_id: studentUser.user_id,
          course_instance_id: '1',
        });
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.status, 'joined');
      },
    );
  });
});
