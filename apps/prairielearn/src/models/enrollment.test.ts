import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';

import { dangerousFullAuthzForTesting } from '../lib/authz-data-lib.js';
import { type CourseInstance, type Enrollment, EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectCourseInstanceById } from './course-instances.js';
import {
  ensureEnrollment,
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
  status: 'invited' | 'joined' | 'blocked' | 'removed' | 'rejected';
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

describe('ensureEnrollment', () => {
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
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'invited');
    assert.isNull(initialEnrollment.first_joined_at);
    assert.isNull(initialEnrollment.user_id);

    await ensureEnrollment({
      courseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    const finalEnrollment = await selectOptionalEnrollmentByUserId({
      courseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.isNotNull(finalEnrollment.first_joined_at);
    assert.isNull(finalEnrollment.pending_uid);
    assert.equal(finalEnrollment.user_id, user.user_id);

    const invitedEnrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      courseInstance,
      requestedRole: 'Student Data Editor',
      authzData: dangerousFullAuthzForTesting(),
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
      userId: user.user_id,
      courseInstance,
      status: 'blocked',
      firstJoinedAt: new Date(),
    });

    const initialEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.user_id,
      courseInstance,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'blocked');
    assert.isNotNull(initialEnrollment.first_joined_at);

    try {
      await ensureEnrollment({
        courseInstance,
        userId: user.user_id,
        requestedRole: 'Student',
        authzData: dangerousFullAuthzForTesting(),
        actionDetail: 'implicit_joined',
      });
      assert.fail('Expected error to be thrown');
    } catch (error) {
      // The model function should throw an error if the user is blocked.
      assert.equal(error.message, 'Access denied');
    }

    const finalEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.user_id,
      courseInstance,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
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
      userId: user.user_id,
      courseInstance,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
    });
    assert.isNull(initialEnrollment);

    await ensureEnrollment({
      courseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    const finalEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.user_id,
      courseInstance,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.isNotNull(finalEnrollment.first_joined_at);
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
      userId: user.user_id,
      courseInstance,
      status: 'joined',
      firstJoinedAt: originalJoinedAt,
    });

    const initialEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.user_id,
      courseInstance,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'joined');
    assert.equal(initialEnrollment.first_joined_at?.getTime(), originalJoinedAt.getTime());

    await ensureEnrollment({
      courseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    const finalEnrollment = await selectOptionalEnrollmentByUserId({
      userId: user.user_id,
      courseInstance,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
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
      pending_lti13_sub,
      pending_lti13_instance_id,
      lti_managed,
    }: {
      user_id: string | null;
      status: string;
      created_at: string | null;
      first_joined_at: string | null;
      pending_uid: string | null;
      pending_lti13_sub?: string | null;
      pending_lti13_instance_id?: number | null;
      lti_managed?: boolean;
    }) => {
      return await queryRow(
        `INSERT INTO enrollments (user_id, course_instance_id, status, created_at, first_joined_at, pending_uid, pending_lti13_sub, pending_lti13_instance_id, lti_managed)
         VALUES ($user_id, $course_instance_id, $status, $created_at, $first_joined_at, $pending_uid, $pending_lti13_sub, $pending_lti13_instance_id, $lti_managed)
         RETURNING *`,
        {
          user_id,
          course_instance_id: courseInstance.id,
          status,
          created_at,
          first_joined_at,
          pending_uid,
          pending_lti13_sub: pending_lti13_sub ?? null,
          pending_lti13_instance_id: pending_lti13_instance_id ?? null,
          lti_managed: lti_managed ?? false,
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

    // Valid states that should not violate the constraint
    const validStates = [
      // created_at is null (old enrollments), constraint doesn't apply
      {
        user_id: user1.user_id,
        status: 'joined',
        created_at: null,
        first_joined_at: null,
        pending_uid: null,
      },
      {
        user_id: user2.user_id,
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
      // status is 'joined', first_joined_at must not be null
      {
        user_id: user3.user_id,
        status: 'joined',
        created_at: '2025-01-01',
        first_joined_at: '2025-01-01',
        pending_uid: null,
      },
      // status is 'removed', first_joined_at must not be null
      {
        user_id: user4.user_id,
        status: 'removed',
        created_at: '2025-01-01',
        first_joined_at: '2025-01-01',
        pending_uid: null,
      },
      // status is 'blocked', first_joined_at must not be null
      {
        user_id: user5.user_id,
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

    // Invalid states that should violate the constraint
    const invalidStates = [
      // status is 'joined', first_joined_at is null
      {
        user_id: invalidUser1.user_id,
        status: 'joined',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
      },
      // status is 'removed', first_joined_at is null
      {
        user_id: invalidUser2.user_id,
        status: 'removed',
        created_at: '2025-01-01',
        first_joined_at: null,
        pending_uid: null,
      },
    ];

    for (const state of invalidStates) {
      try {
        await createEnrollmentWithState(state);
        assert.fail(
          `Expected constraint violation for status '${state.status}' but insertion succeeded`,
        );
      } catch {
        // Expected to fail due to constraint violation
      }
    }
  });
});
