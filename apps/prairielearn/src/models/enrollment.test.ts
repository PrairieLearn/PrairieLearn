import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';

import { EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import {
  ensureEnrollment,
  getEnrollmentForUserInCourseInstance,
  getEnrollmentForUserInCourseInstanceByPendingUid,
} from './enrollment.js';

describe('ensureEnrollment', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
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

    await queryRow(
      `INSERT INTO enrollments (user_id, course_instance_id, status, pending_uid)
       VALUES (NULL, $course_instance_id, 'invited', $pending_uid)
       RETURNING *`,
      {
        course_instance_id: '1',
        pending_uid: user.uid,
      },
      EnrollmentSchema,
    );

    const initialEnrollment = await getEnrollmentForUserInCourseInstanceByPendingUid({
      pending_uid: user.uid,
      course_instance_id: '1',
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'invited');
    assert.isNull(initialEnrollment.first_joined_at);
    assert.isNull(initialEnrollment.user_id);

    await ensureEnrollment({
      course_instance_id: '1',
      user_id: user.user_id,
      agent_user_id: null,
      agent_authn_user_id: null,
      action_detail: 'implicit_joined',
    });

    const finalEnrollment = await getEnrollmentForUserInCourseInstance({
      course_instance_id: '1',
      user_id: user.user_id,
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.isNotNull(finalEnrollment.first_joined_at);
    assert.isNull(finalEnrollment.pending_uid);
    assert.equal(finalEnrollment.user_id, user.user_id);

    const invitedEnrollment = await getEnrollmentForUserInCourseInstanceByPendingUid({
      pending_uid: user.uid,
      course_instance_id: '1',
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

    await queryRow(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'blocked', $first_joined_at)
       RETURNING *`,
      {
        user_id: user.user_id,
        course_instance_id: '1',
        first_joined_at: new Date(),
      },
      EnrollmentSchema,
    );

    const initialEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'blocked');
    assert.isNotNull(initialEnrollment.first_joined_at);

    await ensureEnrollment({
      course_instance_id: '1',
      user_id: user.user_id,
      agent_user_id: null,
      agent_authn_user_id: null,
      action_detail: 'implicit_joined',
    });

    const finalEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
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

    const initialEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNull(initialEnrollment);

    await ensureEnrollment({
      course_instance_id: '1',
      user_id: user.user_id,
      agent_user_id: null,
      agent_authn_user_id: null,
      action_detail: 'implicit_joined',
    });

    const finalEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
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
    await queryRow(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, $course_instance_id, 'joined', $first_joined_at)
       RETURNING *`,
      {
        user_id: user.user_id,
        course_instance_id: '1',
        first_joined_at: originalJoinedAt,
      },
      EnrollmentSchema,
    );

    const initialEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'joined');
    assert.equal(initialEnrollment.first_joined_at?.getTime(), originalJoinedAt.getTime());

    await ensureEnrollment({
      course_instance_id: '1',
      user_id: user.user_id,
      agent_user_id: null,
      agent_authn_user_id: null,
      action_detail: 'implicit_joined',
    });

    const finalEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.equal(finalEnrollment.first_joined_at?.getTime(), originalJoinedAt.getTime());
  });
});

describe('DB validation of enrollment', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
  });

  afterEach(async function () {
    await helperDb.after();
  });

  it('correctly validates various states of enrollments', async () => {
    const courseInstanceId = '1';

    // Helper function to create enrollment with specific state for constraint testing
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
          course_instance_id: courseInstanceId,
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

    // Create users for test cases that need user_id
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

    // Test valid states that should not violate the constraint
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

    // All valid states should insert successfully
    for (const state of validStates) {
      const enrollment = await createEnrollmentWithState(state);
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, state.status);
    }

    // Create users for invalid test cases
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

    // Test invalid states that should violate the constraint
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

    // All invalid states should fail with constraint violation
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
