import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import {
  type Course,
  type CourseInstance,
  CourseInstanceSchema,
  type Enrollment,
  EnrollmentSchema,
  type EnumEnrollmentStatus,
  Lti13CourseInstanceSchema,
} from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectCourseInstanceById } from './course-instances.js';
import {
  deleteCourseInstancePermissions,
  deleteCoursePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
  updateCoursePermissionsRole,
  upsertCourseInstancePermissionsRole,
} from './course-permissions.js';
import { selectCourseById } from './course.js';
import {
  ensureUncheckedEnrollment,
  selectOptionalEnrollmentByPendingUid,
  selectOptionalEnrollmentByUserId,
} from './enrollment.js';

/** Helper function to create enrollments with specific statuses for testing */
async function createEnrollmentWithStatus({
  userId,
  courseInstance,
  status,
  firstJoinedAt,
  pendingUid,
}: {
  userId: string | null;
  courseInstance: CourseInstance;
  status: EnumEnrollmentStatus;
  firstJoinedAt?: Date | null;
  pendingUid?: string | null;
}): Promise<Enrollment> {
  return await queryRow(
    `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at, pending_uid)
     VALUES ($user_id, $course_instance_id, $status, $first_joined_at, $pending_uid)
     RETURNING *`,
    {
      user_id: userId,
      course_instance_id: courseInstance.id,
      status,
      first_joined_at: firstJoinedAt,
      pending_uid: pendingUid,
    },
    EnrollmentSchema,
  );
}

describe('ensureUncheckedEnrollment', () => {
  let courseInstance: CourseInstance;

  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
  });

  afterEach(async function () {
    await helperDb.after();
  });

  it('transitions invited user to enrolled status', async () => {
    const user = await getOrCreateUser({
      uid: 'invited@example.com',
      name: 'Invited User',
      uin: 'invited1',
      email: 'invited@example.com',
    });

    await createEnrollmentWithStatus({
      userId: null,
      courseInstance,
      status: 'invited',
      pendingUid: user.uid,
    });

    const initialEnrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'invited');
    assert.isNull(initialEnrollment.first_joined_at);
    assert.isFalse(initialEnrollment.is_guest);
    assert.isNull(initialEnrollment.user_id);

    await ensureUncheckedEnrollment({
      courseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    const finalEnrollment = await selectOptionalEnrollmentByUserId({
      courseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.isNotNull(finalEnrollment.first_joined_at);
    assert.isFalse(finalEnrollment.is_guest);
    assert.isNull(finalEnrollment.pending_uid);
    assert.equal(finalEnrollment.user_id, user.id);

    const invitedEnrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNull(invitedEnrollment);
  });

  it('does not transition blocked user to enrolled status', async () => {
    const user = await getOrCreateUser({
      uid: 'blocked@example.com',
      name: 'Blocked User',
      uin: 'blocked1',
      email: 'blocked@example.com',
    });

    await createEnrollmentWithStatus({
      userId: user.id,
      courseInstance,
      status: 'blocked',
      firstJoinedAt: new Date(),
    });

    const initialEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'blocked');
    assert.isNotNull(initialEnrollment.first_joined_at);

    try {
      await ensureUncheckedEnrollment({
        courseInstance,
        userId: user.id,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
      assert.fail('Expected error to be thrown');
    } catch (error: any) {
      // The model function should throw an error if the user is blocked.
      assert.equal(error.message, 'Access denied');
    }

    const finalEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'blocked');
    assert.isNotNull(finalEnrollment.first_joined_at);
  });

  it('creates new enrollment for user with no existing enrollment', async () => {
    const user = await getOrCreateUser({
      uid: 'new@example.com',
      name: 'New User',
      uin: 'new1',
      email: 'new@example.com',
    });

    const initialEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNull(initialEnrollment);

    await ensureUncheckedEnrollment({
      courseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    const finalEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.isNotNull(finalEnrollment.first_joined_at);
    assert.isFalse(finalEnrollment.is_guest);
  });

  it('does not modify already enrolled user', async () => {
    const user = await getOrCreateUser({
      uid: 'enrolled@example.com',
      name: 'Enrolled User',
      uin: 'enrolled1',
      email: 'enrolled@example.com',
    });

    const originalJoinedAt = new Date('2023-01-01T00:00:00Z');
    await createEnrollmentWithStatus({
      userId: user.id,
      courseInstance,
      status: 'joined',
      firstJoinedAt: originalJoinedAt,
    });

    const initialEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'joined');
    assert.equal(initialEnrollment.first_joined_at?.getTime(), originalJoinedAt.getTime());

    await ensureUncheckedEnrollment({
      courseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    const finalEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.equal(finalEnrollment.first_joined_at?.getTime(), originalJoinedAt.getTime());
  });
});

describe('DB validation of enrollment', () => {
  let courseInstance: CourseInstance;

  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
  });

  afterEach(async function () {
    await helperDb.after();
  });

  it('correctly validates various states of enrollments', async () => {
    const createEnrollmentWithState = async ({
      user_id,
      status,
      created_at,
      first_joined_at,
      pending_uid,
      pending_uin,
      pending_name,
      pending_email,
      pending_lti13_sub,
      pending_lti13_course_instance_id,
    }: {
      user_id: string | null;
      status: string;
      created_at: string | null;
      first_joined_at: string | null;
      pending_uid: string | null;
      pending_uin?: string | null;
      pending_name?: string | null;
      pending_email?: string | null;
      pending_lti13_sub?: string | null;
      pending_lti13_course_instance_id?: string | null;
    }) => {
      return await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, created_at, first_joined_at, pending_uid, pending_uin, pending_name, pending_email, pending_lti13_sub, pending_lti13_course_instance_id)
         VALUES ($user_id, $course_instance_id, $status, $created_at, $first_joined_at, $pending_uid, $pending_uin, $pending_name, $pending_email, $pending_lti13_sub, $pending_lti13_course_instance_id)
         RETURNING *`,
        {
          user_id,
          course_instance_id: courseInstance.id,
          status,
          created_at,
          first_joined_at,
          pending_uid,
          pending_uin: pending_uin ?? null,
          pending_name: pending_name ?? null,
          pending_email: pending_email ?? null,
          pending_lti13_sub: pending_lti13_sub ?? null,
          pending_lti13_course_instance_id: pending_lti13_course_instance_id ?? null,
        },
        EnrollmentSchema,
      );
    };

    const user1 = await getOrCreateUser({
      uid: 'valid_user_1@example.com',
      name: 'Valid User 1',
      uin: 'valid1',
      email: 'valid_user_1@example.com',
    });
    const user2 = await getOrCreateUser({
      uid: 'valid_user_2@example.com',
      name: 'Valid User 2',
      uin: 'valid2',
      email: 'valid_user_2@example.com',
    });
    const user3 = await getOrCreateUser({
      uid: 'valid_user_3@example.com',
      name: 'Valid User 3',
      uin: 'valid3',
      email: 'valid_user_3@example.com',
    });
    const user4 = await getOrCreateUser({
      uid: 'valid_user_4@example.com',
      name: 'Valid User 4',
      uin: 'valid4',
      email: 'valid_user_4@example.com',
    });
    const user5 = await getOrCreateUser({
      uid: 'valid_user_5@example.com',
      name: 'Valid User 5',
      uin: 'valid5',
      email: 'valid_user_5@example.com',
    });
    const lti13CourseInstance = await queryRow(
      `INSERT INTO lti13_course_instances (course_instance_id, deployment_id, context_id)
       VALUES ($course_instance_id, 'expected-identity-deployment', 'expected-identity-context')
       RETURNING id`,
      { course_instance_id: courseInstance.id },
      Lti13CourseInstanceSchema.pick({ id: true }),
    );

    // Valid states that should not violate the constraint
    const validStates = [
      // created_at is null (old enrollments), constraint doesn't apply
      {
        user_id: user1.id,
        status: 'joined',
        created_at: null,
        first_joined_at: null,
        pending_uid: null,
      },
      {
        user_id: user2.id,
        status: 'removed',
        created_at: null,
        first_joined_at: null,
        pending_uid: null,
      },
      // status is 'invited', first_joined_at can be null or not null
      {
        user_id: null,
        status: 'invited',
        created_at: null,
        first_joined_at: '2025-01-01',
        pending_uid: 'invited_1@example.com',
      },
      {
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: 'invited_2@example.com',
      },
      // pending_uin is an alternative generic identity key
      {
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
        pending_uin: 'expected-uin',
        pending_name: 'Expected Student',
        pending_email: 'expected@example.com',
      },
      // UID and UIN may coexist when both are known
      {
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: 'both-keys@example.com',
        pending_uin: 'both-keys-uin',
      },
      // An LTI association accompanies the UIN supplied by the roster
      {
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
        pending_uin: 'lti-expected-uin',
        pending_lti13_sub: 'lti-expected-sub',
        pending_lti13_course_instance_id: lti13CourseInstance.id,
      },
      // The roster may supply both generic keys alongside the LTI association
      {
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: 'lti-expected-uid@example.com',
        pending_uin: 'lti-expected-uid-uin',
        pending_name: 'Expected UID Student',
        pending_email: 'lti-expected-uid@example.com',
        pending_lti13_sub: 'lti-expected-uid-sub',
        pending_lti13_course_instance_id: lti13CourseInstance.id,
      },
      // status is 'rejected', first_joined_at can be null or not null
      {
        user_id: null,
        status: 'rejected',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: 'rejected_1@example.com',
      },
      {
        user_id: null,
        status: 'rejected',
        created_at: '2025-01-01',
        first_joined_at: '2025-01-01',
        pending_uid: 'rejected_2@example.com',
      },
      {
        user_id: null,
        status: 'rejected',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
        pending_uin: 'rejected-uin',
      },
      // status is 'joined', first_joined_at must not be null
      {
        user_id: user3.id,
        status: 'joined',
        created_at: '2025-01-01',
        first_joined_at: '2025-01-01',
        pending_uid: null,
      },
      // status is 'left', first_joined_at must not be null
      {
        user_id: user4.id,
        status: 'left',
        created_at: '2025-01-01',
        first_joined_at: '2025-01-01',
        pending_uid: null,
      },
      // status is 'blocked', first_joined_at must not be null
      {
        user_id: user5.id,
        status: 'blocked',
        created_at: '2025-01-01',
        first_joined_at: '2025-01-01',
        pending_uid: null,
      },
    ];

    for (const state of validStates) {
      const enrollment = await createEnrollmentWithState(state);
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, state.status);
    }

    const invalidUser1 = await getOrCreateUser({
      uid: 'invalid_user_1@example.com',
      name: 'Invalid User 1',
      uin: 'invalid1',
      email: 'invalid_user_1@example.com',
    });
    const invalidUser2 = await getOrCreateUser({
      uid: 'invalid_user_2@example.com',
      name: 'Invalid User 2',
      uin: 'invalid2',
      email: 'invalid_user_2@example.com',
    });
    const invalidUser3 = await getOrCreateUser({
      uid: 'invalid_user_3@example.com',
      name: 'Invalid User 3',
      uin: 'invalid3',
      email: 'invalid_user_3@example.com',
    });
    const invalidUser4 = await getOrCreateUser({
      uid: 'invalid_user_4@example.com',
      name: 'Invalid User 4',
      uin: 'invalid4',
      email: 'invalid_user_4@example.com',
    });

    // Invalid states that should violate the constraint
    const invalidStates = [
      // The legacy LTI-specific lifecycle status is no longer valid
      {
        constraint: 'enrollments_status_not_lti13_pending',
        user_id: invalidUser1.id,
        status: 'lti13_pending',
        created_at: null,
        first_joined_at: null,
        pending_uid: null,
      },
      // status is 'joined', first_joined_at is null
      {
        constraint: 'first_joined_at_not_null_if_joined_and_created_at_not_null',
        user_id: invalidUser1.id,
        status: 'joined',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
      },
      // status is 'left', first_joined_at is null
      {
        constraint: 'first_joined_at_not_null_if_joined_and_created_at_not_null',
        user_id: invalidUser2.id,
        status: 'left',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
      },
      // status is 'removed', first_joined_at is null
      {
        constraint: 'first_joined_at_not_null_if_joined_and_created_at_not_null',
        user_id: invalidUser3.id,
        status: 'removed',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
      },
      // Display fields do not identify an expected user
      {
        constraint: 'enrollments_pending_identity_required',
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
        pending_name: 'Display Only',
        pending_email: 'display-only@example.com',
      },
      // Both parts of the LTI association are required
      {
        constraint: 'enrollments_lti13_sub_course_instance_id_pair',
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
        pending_uin: 'sub-without-course-instance-uin',
        pending_lti13_sub: 'sub-without-instance',
      },
      {
        constraint: 'enrollments_lti13_sub_course_instance_id_pair',
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: 'instance-without-sub@example.com',
        pending_uin: 'instance-without-sub-uin',
        pending_lti13_course_instance_id: lti13CourseInstance.id,
      },
      // The roster's LTI association is only usable alongside its required UIN
      {
        constraint: 'enrollments_lti13_sub_requires_uin',
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: 'sub-without-uin@example.com',
        pending_lti13_sub: 'sub-without-uin',
        pending_lti13_course_instance_id: lti13CourseInstance.id,
      },
      // Resolved rows cannot retain pending display data
      {
        constraint: 'enrollments_pending_fields_null_if_resolved',
        user_id: invalidUser4.id,
        status: 'joined',
        created_at: '2025-01-01',
        first_joined_at: '2025-01-01',
        pending_uid: null,
        pending_name: 'Resolved User',
      },
      // pending_uin is unique within a course instance
      {
        constraint: 'enrollments_course_instance_id_pending_uin_key',
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
        pending_uin: 'expected-uin',
      },
      // An LTI association is unique within its LTI and PL course instances
      {
        constraint: 'enrollments_pending_lti13_ciid_sub_course_instance_id_key',
        user_id: null,
        status: 'invited',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
        pending_uin: 'duplicate-lti-association-uin',
        pending_lti13_sub: 'lti-expected-sub',
        pending_lti13_course_instance_id: lti13CourseInstance.id,
      },
    ];

    for (const state of invalidStates) {
      await expect(createEnrollmentWithState(state)).rejects.toThrow(state.constraint);
    }
  });
});

describe('staff permissions enrollment updates', () => {
  let course: Course;
  let courseInstance: CourseInstance;

  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
    course = await selectCourseById(courseInstance.course_id);
  });

  afterEach(async function () {
    await helperDb.after();
  });

  async function createEnrolledUser(uid: string) {
    const user = await getOrCreateUser({ uid, name: uid, uin: uid, email: uid });
    await ensureUncheckedEnrollment({
      courseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'explicit_joined',
    });
    return user;
  }

  async function getEnrollmentStatus(userId: string) {
    const enrollment = await selectOptionalEnrollmentByUserId({
      courseInstance,
      userId,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(enrollment);
    return enrollment.status;
  }

  it('sets enrollment to removed when granting course-level staff permissions', async () => {
    const user = await createEnrolledUser('student1@test.com');
    assert.equal(await getEnrollmentStatus(user.id), 'joined');

    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'Viewer',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');
  });

  it('sets enrollment to removed when granting course instance-level staff permissions', async () => {
    const user = await createEnrolledUser('student2@test.com');
    assert.equal(await getEnrollmentStatus(user.id), 'joined');

    await insertCourseInstancePermissions({
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');
  });

  it('does not change enrollment when granting None role', async () => {
    const user = await createEnrolledUser('student3@test.com');

    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'None',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'joined');
  });

  it('sets blocked enrollment to removed when granting staff permissions', async () => {
    const user = await getOrCreateUser({
      uid: 'blocked-staff@test.com',
      name: 'blocked-staff@test.com',
      uin: 'blocked-staff@test.com',
      email: 'blocked-staff@test.com',
    });
    await createEnrollmentWithStatus({
      userId: user.id,
      courseInstance,
      status: 'blocked',
      firstJoinedAt: new Date(),
    });
    assert.equal(await getEnrollmentStatus(user.id), 'blocked');

    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'Viewer',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');
  });

  it('hard deletes invited enrollment when granting staff permissions', async () => {
    const user = await getOrCreateUser({
      uid: 'invited-staff@test.com',
      name: 'invited-staff@test.com',
      uin: 'invited-staff@test.com',
      email: 'invited-staff@test.com',
    });
    await createEnrollmentWithStatus({
      userId: null,
      courseInstance,
      status: 'invited',
      pendingUid: user.uid,
    });

    const initialEnrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'invited');

    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'Viewer',
      authn_user_id: user.id,
    });

    const enrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNull(enrollment);
  });

  it('hard deletes rejected enrollment when granting staff permissions', async () => {
    const user = await getOrCreateUser({
      uid: 'rejected-staff@test.com',
      name: 'rejected-staff@test.com',
      uin: 'rejected-staff@test.com',
      email: 'rejected-staff@test.com',
    });
    await createEnrollmentWithStatus({
      userId: null,
      courseInstance,
      status: 'rejected',
      pendingUid: user.uid,
    });

    const initialEnrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'rejected');

    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'Viewer',
      authn_user_id: user.id,
    });

    const enrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNull(enrollment);
  });

  it('sets enrollment to removed via upsertCourseInstancePermissionsRole', async () => {
    const user = await createEnrolledUser('upsert-staff@test.com');
    assert.equal(await getEnrollmentStatus(user.id), 'joined');

    // The user must have a course_permissions row before the upsert.
    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'None',
      authn_user_id: user.id,
    });
    assert.equal(await getEnrollmentStatus(user.id), 'joined');

    await upsertCourseInstancePermissionsRole({
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');
  });

  it('sets enrollment to removed via updateCoursePermissionsRole', async () => {
    const user = await createEnrolledUser('update-cp@test.com');
    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'None',
      authn_user_id: user.id,
    });
    assert.equal(await getEnrollmentStatus(user.id), 'joined');

    await updateCoursePermissionsRole({
      course_id: course.id,
      user_id: user.id,
      course_role: 'Viewer',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');
  });

  it('sets enrollment to removed via updateCourseInstancePermissionsRole', async () => {
    const user = await createEnrolledUser('update-cip@test.com');
    await insertCourseInstancePermissions({
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: user.id,
    });
    assert.equal(await getEnrollmentStatus(user.id), 'removed');

    // Re-create a 'joined' enrollment to simulate legacy/manual data, then
    // verify that an unrelated role update still keeps it consistent.
    await queryRow(
      "UPDATE enrollments SET status = 'joined' WHERE user_id = $user_id AND course_instance_id = $course_instance_id RETURNING *",
      { user_id: user.id, course_instance_id: courseInstance.id },
      EnrollmentSchema,
    );
    assert.equal(await getEnrollmentStatus(user.id), 'joined');

    await updateCourseInstancePermissionsRole({
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
      course_instance_role: 'Student Data Editor',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');
  });

  it('does not re-enroll a removed user when revoking course permissions', async () => {
    const user = await createEnrolledUser('revoke-cp@test.com');
    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'Viewer',
      authn_user_id: user.id,
    });
    assert.equal(await getEnrollmentStatus(user.id), 'removed');

    await deleteCoursePermissions({
      course_id: course.id,
      user_id: user.id,
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');
  });

  it('does not re-enroll a removed user when revoking course instance permissions', async () => {
    const user = await createEnrolledUser('revoke-cip@test.com');
    await insertCourseInstancePermissions({
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: user.id,
    });
    assert.equal(await getEnrollmentStatus(user.id), 'removed');

    await deleteCourseInstancePermissions({
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');
  });

  it("preserves 'left' enrollment when granting staff permissions", async () => {
    const user = await getOrCreateUser({
      uid: 'left-staff@test.com',
      name: 'left-staff@test.com',
      uin: 'left-staff@test.com',
      email: 'left-staff@test.com',
    });
    await createEnrollmentWithStatus({
      userId: user.id,
      courseInstance,
      status: 'left',
      firstJoinedAt: new Date(),
    });

    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: user.uid,
      course_role: 'Viewer',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'left');
  });

  it('only affects the targeted course instance for instance-scoped grants', async () => {
    const user = await createEnrolledUser('multi-ci@test.com');
    assert.equal(await getEnrollmentStatus(user.id), 'joined');

    // Create a second course instance in the same course and enroll the user there too.
    const otherCourseInstance = await queryRow(
      `INSERT INTO course_instances (course_id, short_name, long_name, display_timezone, enrollment_code)
       VALUES ($course_id, 'Other', 'Other', 'UTC', 'multi-ci-test-code')
       RETURNING *`,
      { course_id: course.id },
      CourseInstanceSchema,
    );
    await ensureUncheckedEnrollment({
      courseInstance: otherCourseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'explicit_joined',
    });

    await insertCourseInstancePermissions({
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: user.id,
    });

    assert.equal(await getEnrollmentStatus(user.id), 'removed');

    const otherEnrollment = await selectOptionalEnrollmentByUserId({
      courseInstance: otherCourseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.isNotNull(otherEnrollment);
    assert.equal(otherEnrollment.status, 'joined');
  });
});
