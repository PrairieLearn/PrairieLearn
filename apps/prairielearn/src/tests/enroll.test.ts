import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';

import { execute, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { PotentialEnrollmentStatus } from '../ee/models/enrollment.js';
import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { getSelfEnrollmentLinkUrl, getSelfEnrollmentLookupUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { type CourseInstance, EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectEnrollmentIdentityClassification } from '../models/enrollment-identity.js';
import {
  selectOptionalEnrollmentByPendingUid,
  selectOptionalEnrollmentByUserId,
} from '../models/enrollment.js';

import * as helperCourse from './helperCourse.js';
import * as helperServer from './helperServer.js';
import {
  createInstitution,
  deleteEnrollmentsInCourseInstance,
  getConfiguredUser,
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

describe('Enrollment status pages', function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test('shows limit exceeded message on /limit_exceeded', async () => {
    const res = await fetch(`${baseUrl}/enroll/limit_exceeded`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.include(text, 'Enrollment limit exceeded');
  });
});

describe('Enrollment limits (enterprise)', { concurrent: false }, function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  const originalIsEnterprise = config.isEnterprise;
  beforeAll(() => (config.isEnterprise = true));
  afterAll(() => (config.isEnterprise = originalIsEnterprise));

  test('enroll a single student', async () => {
    const status = await enrollUser('1', USER_1);
    assert.equal(status, PotentialEnrollmentStatus.ALLOWED);
  });

  test('enrolls the same student again', async () => {
    const status = await enrollUser('1', USER_1);
    assert.equal(status, PotentialEnrollmentStatus.ALLOWED);
  });

  test('unenroll a single student', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, siteUrl + '/');
  });

  test('unenroll the same student again', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, siteUrl + '/');
  });

  test('apply a course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1');
  });

  test('enroll one student', async () => {
    const status = await enrollUser('1', USER_1);
    assert.equal(status, PotentialEnrollmentStatus.ALLOWED);
  });

  test('fail to enroll a second student', async () => {
    const status = await enrollUser('1', USER_2);
    assert.equal(status, PotentialEnrollmentStatus.LIMIT_EXCEEDED);
  });

  test('apply an institution-level course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1');
    await execute('UPDATE institutions SET course_instance_enrollment_limit = 1 WHERE id = 1');
  });

  test('fail to enroll a second student', async () => {
    const status = await enrollUser('1', USER_2);
    assert.equal(status, PotentialEnrollmentStatus.LIMIT_EXCEEDED);
  });

  test('set a higher course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 2 WHERE id = 1');
  });

  test('enroll a second student', async () => {
    const status = await enrollUser('1', USER_2);
    assert.equal(status, PotentialEnrollmentStatus.ALLOWED);
  });

  test('fail to enroll a third student', async () => {
    const status = await enrollUser('1', USER_3);
    assert.equal(status, PotentialEnrollmentStatus.LIMIT_EXCEEDED);
  });

  test('set a yearly enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1');
    await execute(
      'UPDATE institutions SET course_instance_enrollment_limit = 100000, yearly_enrollment_limit = 2 WHERE id = 1',
      {},
    );
  });

  test('fail to enroll a third student', async () => {
    const status = await enrollUser('1', USER_3);
    assert.equal(status, PotentialEnrollmentStatus.LIMIT_EXCEEDED);
  });
});

// Enrollment limits should not apply for non-enterprise instances (the default).
describe('Enrollment limits (non-enterprise)', { concurrent: false }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test('apply a course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1');
  });

  test('enroll one student', async () => {
    const status = await enrollUser('1', USER_1);
    assert.equal(status, PotentialEnrollmentStatus.ALLOWED);
  });

  test('enroll a second student (limits not enforced in non-enterprise)', async () => {
    const status = await enrollUser('1', USER_2);
    // In non-enterprise mode, limits are not enforced
    assert.equal(status, PotentialEnrollmentStatus.ALLOWED);
  });
});

describe('Self-enrollment settings transitions', () => {
  let courseInstance: CourseInstance;

  const courseInstanceUrl = baseUrl + '/course_instance/1';
  const assessmentsUrl = courseInstanceUrl + '/assessments';

  beforeAll(async function () {
    await helperServer.before()();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);

    courseInstance = await selectCourseInstanceById('1');

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
      restrictToInstitution: false,
    });

    const studentUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student1',
      email: 'student@example.com',
      institutionId: '1',
    });

    await withUser(studentUser, async () => {
      const initialEnrollment = await selectOptionalEnrollmentByUserId({
        userId: studentUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNull(initialEnrollment);

      // Enroll user via the assessments endpoint
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 403);

      // Check that user is now enrolled
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: studentUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNull(finalEnrollment);
    });
  });

  it('does not enroll an administrator who visits the join route', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const administrator = await getConfiguredUser();
    const response = await fetch(`${courseInstanceUrl}/join`, { redirect: 'manual' });
    assert.equal(response.status, 302);

    const enrollment = await selectOptionalEnrollmentByUserId({
      userId: administrator.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNull(enrollment);
  });

  it('allows user to self-enroll via the assessments endpoint when self-enrollment is enabled', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: false,
      restrictToInstitution: false,
    });

    const studentUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student1',
      email: 'student@example.com',
      institutionId: '1',
    });

    await withUser(studentUser, async () => {
      const initialEnrollment = await selectOptionalEnrollmentByUserId({
        userId: studentUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNull(initialEnrollment);

      // Enroll user via the assessments endpoint
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 200);

      // Check that user is now enrolled
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: studentUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });
  });

  it('allows invited user to self-enroll via the assessments endpoint when self-enrollment is disabled', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: false,
      restrictToInstitution: false,
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

    await withUser(invitedUser, async () => {
      const initialEnrollment = await selectOptionalEnrollmentByPendingUid({
        pendingUid: invitedUser.uid,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(initialEnrollment);
      assert.equal(initialEnrollment.status, 'invited');

      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 200);

      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: invitedUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
      assert.isNull(finalEnrollment.pending_uid);
    });
  });

  it('allows a roster-invited user to enroll when self-enrollment is disabled and a code is required', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const rosterUser = await getOrCreateUser({
      uid: 'roster@example.com',
      name: 'Roster Student',
      uin: 'roster1',
      email: 'roster@example.com',
      institutionId: '1',
    });
    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uin)
       VALUES ($course_instance_id, 'invited', $pending_uin)`,
      {
        course_instance_id: '1',
        pending_uin: rosterUser.uin,
      },
    );

    await withUser(rosterUser, async () => {
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 200);

      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: rosterUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'joined');
      assert.isNull(enrollment.pending_uin);
    });
  });

  it('looks up an actionable roster invitation when self-enrollment is disabled', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const rosterUser = await getOrCreateUser({
      uid: 'lookup-roster@example.com',
      name: 'Lookup Roster Student',
      uin: 'lookup-roster1',
      email: 'lookup-roster@example.com',
      institutionId: '1',
    });
    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uin)
       VALUES ($course_instance_id, 'invited', $pending_uin)`,
      {
        course_instance_id: '1',
        pending_uin: rosterUser.uin,
      },
    );

    await withUser(rosterUser, async () => {
      const response = await fetch(
        siteUrl + getSelfEnrollmentLookupUrl(courseInstance.enrollment_code, courseInstance.id),
        { headers: { Accept: 'application/json' } },
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { course_instance_id: courseInstance.id });

      const classification = await selectEnrollmentIdentityClassification({
        courseInstanceId: courseInstance.id,
        userId: rosterUser.id,
      });
      assert.lengthOf(classification.actionableInstitutionRosterInvitationCandidates, 1);
      assert.isNull(
        classification.actionableInstitutionRosterInvitationCandidates[0].enrollment.user_id,
      );
    });
  });

  it('looks up a bound-left user with an actionable roster invitation', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const rosterUser = await getOrCreateUser({
      uid: 'lookup-left-roster@example.com',
      name: 'Lookup Left Roster Student',
      uin: 'lookup-left-roster1',
      email: 'lookup-left-roster@example.com',
      institutionId: '1',
    });
    await execute(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'left', $first_joined_at)`,
      {
        user_id: rosterUser.id,
        course_instance_id: '1',
        first_joined_at: new Date('2024-01-01T00:00:00Z'),
      },
    );
    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uin)
       VALUES ($course_instance_id, 'invited', $pending_uin)`,
      {
        course_instance_id: '1',
        pending_uin: rosterUser.uin,
      },
    );

    await withUser(rosterUser, async () => {
      const response = await fetch(
        siteUrl + getSelfEnrollmentLookupUrl(courseInstance.enrollment_code, courseInstance.id),
        { headers: { Accept: 'application/json' } },
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { course_instance_id: courseInstance.id });
    });
  });

  it('does not look up a removed user with a non-actionable roster candidate', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const removedUser = await getOrCreateUser({
      uid: 'lookup-removed-roster@example.com',
      name: 'Lookup Removed Roster Student',
      uin: 'lookup-removed-roster1',
      email: 'lookup-removed-roster@example.com',
      institutionId: '1',
    });
    await execute(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'removed', $first_joined_at)`,
      {
        user_id: removedUser.id,
        course_instance_id: '1',
        first_joined_at: new Date('2024-01-01T00:00:00Z'),
      },
    );
    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uin)
       VALUES ($course_instance_id, 'invited', $pending_uin)`,
      {
        course_instance_id: '1',
        pending_uin: removedUser.uin,
      },
    );

    await withUser(removedUser, async () => {
      const response = await fetch(
        siteUrl + getSelfEnrollmentLookupUrl(courseInstance.enrollment_code, courseInstance.id),
        { headers: { Accept: 'application/json' } },
      );
      assert.equal(response.status, 403);
    });
  });

  it('allows a bound-left user with a roster invitation to bypass the enrollment code', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const rosterUser = await getOrCreateUser({
      uid: 'left-roster@example.com',
      name: 'Left Roster Student',
      uin: 'left-roster1',
      email: 'left-roster@example.com',
      institutionId: '1',
    });
    await execute(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'left', $first_joined_at)`,
      {
        user_id: rosterUser.id,
        course_instance_id: '1',
        first_joined_at: new Date('2024-01-01T00:00:00Z'),
      },
    );
    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uin)
       VALUES ($course_instance_id, 'invited', $pending_uin)`,
      {
        course_instance_id: '1',
        pending_uin: rosterUser.uin,
      },
    );

    await withUser(rosterUser, async () => {
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 200);

      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: rosterUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'joined');
      assert.equal(enrollment.first_joined_at?.toISOString(), '2024-01-01T00:00:00.000Z');
      assert.isNull(enrollment.pending_uin);
    });
  });

  it('requires a plain bound-left user to enter the enrollment code', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const leftUser = await getOrCreateUser({
      uid: 'left@example.com',
      name: 'Left Student',
      uin: 'left1',
      email: 'left@example.com',
      institutionId: '1',
    });
    await execute(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'left', $first_joined_at)`,
      {
        user_id: leftUser.id,
        course_instance_id: '1',
        first_joined_at: new Date('2024-01-01T00:00:00Z'),
      },
    );

    await withUser(leftUser, async () => {
      const response = await fetch(assessmentsUrl, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.isTrue(response.headers.get('location')?.includes('/join'));

      const joinResponse = await fetch(`${courseInstanceUrl}/join`);
      assert.equal(joinResponse.status, 200);
      assert.include(await joinResponse.text(), 'Join course via enrollment code');

      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: leftUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'left');
    });
  });

  it('does not treat a guest roster candidate as admission authority', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const guestUser = await getOrCreateUser({
      uid: 'guest-roster@example.com',
      name: 'Guest Roster Student',
      uin: 'guest-roster1',
      email: 'guest-roster@example.com',
      institutionId: '1',
    });
    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uin, is_guest)
       VALUES ($course_instance_id, 'invited', $pending_uin, TRUE)`,
      {
        course_instance_id: '1',
        pending_uin: guestUser.uin,
      },
    );

    await withUser(guestUser, async () => {
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 403);

      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: guestUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNull(enrollment);
    });
  });

  it('does not let a bound-removed user gain authority from a roster candidate', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const removedUser = await getOrCreateUser({
      uid: 'removed-roster@example.com',
      name: 'Removed Roster Student',
      uin: 'removed-roster1',
      email: 'removed-roster@example.com',
      institutionId: '1',
    });
    await execute(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'removed', $first_joined_at)`,
      {
        user_id: removedUser.id,
        course_instance_id: '1',
        first_joined_at: new Date('2024-01-01T00:00:00Z'),
      },
    );
    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uin)
       VALUES ($course_instance_id, 'invited', $pending_uin)`,
      {
        course_instance_id: '1',
        pending_uin: removedUser.uin,
      },
    );

    await withUser(removedUser, async () => {
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 403);

      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: removedUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'removed');
    });
  });

  it('leaves an already-joined enrollment unchanged', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const joinedUser = await getOrCreateUser({
      uid: 'joined@example.com',
      name: 'Joined Student',
      uin: 'joined1',
      email: 'joined@example.com',
      institutionId: '1',
    });
    const enrollment = await queryRow(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
       RETURNING *`,
      {
        user_id: joinedUser.id,
        course_instance_id: '1',
        first_joined_at: new Date('2024-01-01T00:00:00Z'),
      },
      EnrollmentSchema,
    );

    await withUser(joinedUser, async () => {
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 200);

      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: joinedUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.id, enrollment.id);
      assert.equal(finalEnrollment.first_joined_at?.toISOString(), '2024-01-01T00:00:00.000Z');
    });
  });

  it('does not allow rejected user to self-enroll via the assessments endpoint when self-enrollment is disabled', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: false,
      restrictToInstitution: false,
    });

    const rejectedUser = await getOrCreateUser({
      uid: 'rejected@example.com',
      name: 'Rejected Student',
      uin: 'rejected1',
      email: 'rejected@example.com',
      institutionId: '1',
    });

    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uid)
       VALUES ($course_instance_id, 'rejected', $pending_uid)`,
      {
        course_instance_id: '1',
        pending_uid: rejectedUser.uid,
      },
    );

    await withUser(rejectedUser, async () => {
      const initialEnrollment = await selectOptionalEnrollmentByPendingUid({
        pendingUid: rejectedUser.uid,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(initialEnrollment);
      assert.equal(initialEnrollment.status, 'rejected');

      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 403);

      const finalEnrollment = await selectOptionalEnrollmentByPendingUid({
        pendingUid: rejectedUser.uid,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'rejected');
      assert.isNotNull(finalEnrollment.pending_uid);
    });
  });

  it('does not allow removed user to self-enroll via the assessments endpoint when self-enrollment is disabled', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: false,
      restrictToInstitution: false,
    });

    const removedUser = await getOrCreateUser({
      uid: 'removed@example.com',
      name: 'Removed Student',
      uin: 'removed1',
      email: 'removed@example.com',
      institutionId: '1',
    });

    await execute(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'removed', $first_joined_at)`,
      {
        user_id: removedUser.id,
        course_instance_id: '1',
        first_joined_at: new Date(),
      },
    );

    await withUser(removedUser, async () => {
      const initialEnrollment = await selectOptionalEnrollmentByUserId({
        userId: removedUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(initialEnrollment);
      assert.equal(initialEnrollment.status, 'removed');

      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 403);

      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: removedUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'removed');
    });
  });

  it('does not allow blocked user to self-enroll via the assessments endpoint', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: false,
      restrictToInstitution: false,
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
        user_id: blockedUser.id,
        course_instance_id: '1',
        first_joined_at: new Date(),
      },
    );

    await withUser(blockedUser, async () => {
      // Check that user got a 403 for blocked users
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 403);

      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: blockedUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'blocked');
    });
  });

  it('redirects to join page when enrollment code is required and a rejected user goes to assessments endpoint', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const rejectedUser = await getOrCreateUser({
      uid: 'rejected@example.com',
      name: 'Rejected Student',
      uin: 'rejected1',
      email: 'rejected@example.com',
      institutionId: '1',
    });

    await execute(
      `INSERT INTO enrollments (course_instance_id, status, pending_uid)
       VALUES ($course_instance_id, 'rejected', $pending_uid)`,
      {
        course_instance_id: '1',
        pending_uid: rejectedUser.uid,
      },
    );

    await withUser(rejectedUser, async () => {
      // Check the user got redirected to the join page
      const response = await fetch(assessmentsUrl, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.isTrue(response.headers.get('location')?.includes('/join'));

      // Check that user is still not enrolled
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: rejectedUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNull(finalEnrollment);
    });
  });

  it('redirects to join page when enrollment code is required and user goes to assessments endpoint', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const studentUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student1',
      email: 'student@example.com',
      institutionId: '1',
    });

    await withUser(studentUser, async () => {
      // Check the user got redirected to the join page
      const response = await fetch(assessmentsUrl, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.isTrue(response.headers.get('location')?.includes('/join'));

      // Check that user is still not enrolled
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: studentUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNull(finalEnrollment);
    });
  });

  it('redirects and enrolls user when enrollment code is required and user goes to self-enrollment link', async () => {
    await deleteEnrollmentsInCourseInstance('1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      selfEnrollmentUseEnrollmentCode: true,
      restrictToInstitution: false,
    });

    const studentUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student1',
      email: 'student@example.com',
      institutionId: '1',
    });

    await withUser(studentUser, async () => {
      // Check the user got redirected to the assessments page
      const response = await fetch(
        siteUrl +
          getSelfEnrollmentLinkUrl({
            courseInstanceId: '1',
            enrollmentCode: courseInstance.enrollment_code,
          }),
        { redirect: 'manual' },
      );
      assert.equal(response.status, 302);
      assert.isTrue(response.headers.get('location')?.includes('/assessments'));

      // Check that user is now enrolled
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: studentUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });
  });
});

describe('Self-enrollment institution restriction transitions', () => {
  const courseInstanceUrl = baseUrl + '/course_instance/1';
  const assessmentsUrl = courseInstanceUrl + '/assessments';

  beforeAll(async function () {
    await helperServer.before()();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);

    // Set uid_regexp for the default institution to allow @example.com UIDs
    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$' WHERE id = 1");
  });

  afterAll(async function () {
    await helperServer.after();
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
      selfEnrollmentUseEnrollmentCode: false,
    });

    // Create user from same institution
    const sameInstitutionUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Same Institution Student',
      uin: 'same1',
      email: 'student@example.com',
    });

    // Update user's institution to match course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE id = $user_id', {
      institution_id: '1',
      user_id: sameInstitutionUser.id,
    });

    await withUser(sameInstitutionUser, async () => {
      const initialEnrollment = await queryOptionalRow(
        'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
        { user_id: sameInstitutionUser.id, course_instance_id: '1' },
        EnrollmentSchema,
      );
      assert.isNull(initialEnrollment);

      // Hit the assessments endpoint - this should trigger auto-enrollment
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 200);

      // Check that user is now enrolled
      const finalEnrollment = await queryOptionalRow(
        'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
        { user_id: sameInstitutionUser.id, course_instance_id: '1' },
        EnrollmentSchema,
      );
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });
  });

  it('blocks user from different institution when restrictToInstitution is true', async () => {
    // Clean up any existing enrollments
    await deleteEnrollmentsInCourseInstance('1');

    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Update the course to belong to institution 2 (different from default institution 1)
    await execute(
      'UPDATE courses SET institution_id = $institution_id WHERE id = (SELECT course_id FROM course_instances WHERE id = $course_instance_id)',
      {
        institution_id: '2',
        course_instance_id: '1',
      },
    );

    // Set up course instance with institution restriction enabled
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: true,
      // NOTE: You can only do this in the UI when you are using modern publishing.
      restrictToInstitution: true,
      selfEnrollmentUseEnrollmentCode: false,
    });

    // Create user from default institution (institution 1)
    const defaultInstitutionUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Default Institution Student',
      uin: 'default1',
      email: 'student@example.com',
    });

    await withUser(defaultInstitutionUser, async () => {
      const initialEnrollment = await queryOptionalRow(
        'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
        { user_id: defaultInstitutionUser.id, course_instance_id: '1' },
        EnrollmentSchema,
      );
      assert.isNull(initialEnrollment);

      // Hit the assessments endpoint - this should NOT trigger auto-enrollment
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 403);

      // Check that user is still not enrolled.
      const finalEnrollment = await queryOptionalRow(
        'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
        { user_id: defaultInstitutionUser.id, course_instance_id: '1' },
        EnrollmentSchema,
      );
      assert.isNull(finalEnrollment);
    });
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
      selfEnrollmentUseEnrollmentCode: false,
    });

    const differentInstitutionUser = await getOrCreateUser({
      uid: 'student@other.com',
      name: 'Different Institution Student',
      uin: 'diff1',
      email: 'student@other.com',
    });

    // Update user's institution to be different from course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE id = $user_id', {
      institution_id: '2',
      user_id: differentInstitutionUser.id,
    });

    await withUser(differentInstitutionUser, async () => {
      const initialEnrollment = await queryOptionalRow(
        'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
        { user_id: differentInstitutionUser.id, course_instance_id: '1' },
        EnrollmentSchema,
      );
      assert.isNull(initialEnrollment);

      // Hit the assessments endpoint - this should trigger auto-enrollment
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 200);

      // Check that user is now enrolled
      const finalEnrollment = await queryOptionalRow(
        'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
        { user_id: differentInstitutionUser.id, course_instance_id: '1' },
        EnrollmentSchema,
      );
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });
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
      selfEnrollmentUseEnrollmentCode: false,
    });

    // Create user from different institution
    const differentInstitutionUser = await getOrCreateUser({
      uid: 'invited@other.com',
      name: 'Invited Different Institution Student',
      uin: 'invited1',
      email: 'invited@other.com',
    });

    // Update user's institution to be different from course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE id = $user_id', {
      institution_id: '2',
      user_id: differentInstitutionUser.id,
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

    await withUser(differentInstitutionUser, async () => {
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
        { user_id: differentInstitutionUser.id, course_instance_id: '1' },
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
    });
  });
});
