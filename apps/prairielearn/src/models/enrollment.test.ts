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
    assert.isNull(initialEnrollment.joined_at);
    assert.isNull(initialEnrollment.user_id);

    await ensureEnrollment({
      course_instance_id: '1',
      user_id: user.user_id,
      agent_user_id: null,
      agent_authn_user_id: null,
    });

    const finalEnrollment = await getEnrollmentForUserInCourseInstance({
      course_instance_id: '1',
      user_id: user.user_id,
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.isNotNull(finalEnrollment.joined_at);
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
      `INSERT INTO enrollments (user_id, course_instance_id, status)
       VALUES ($user_id, $course_instance_id, 'blocked')
       RETURNING *`,
      {
        user_id: user.user_id,
        course_instance_id: '1',
      },
      EnrollmentSchema,
    );

    const initialEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'blocked');
    assert.isNull(initialEnrollment.joined_at);

    await ensureEnrollment({
      course_instance_id: '1',
      user_id: user.user_id,
      agent_user_id: null,
      agent_authn_user_id: null,
    });

    const finalEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'blocked');
    assert.isNull(finalEnrollment.joined_at);
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
    });

    const finalEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.isNotNull(finalEnrollment.joined_at);
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
      `INSERT INTO enrollments (user_id, course_instance_id, status, joined_at)
       VALUES ($user_id, $course_instance_id, 'joined', $joined_at)
       RETURNING *`,
      {
        user_id: user.user_id,
        course_instance_id: '1',
        joined_at: originalJoinedAt,
      },
      EnrollmentSchema,
    );

    const initialEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'joined');
    assert.equal(initialEnrollment.joined_at?.getTime(), originalJoinedAt.getTime());

    await ensureEnrollment({
      course_instance_id: '1',
      user_id: user.user_id,
      agent_user_id: null,
      agent_authn_user_id: null,
    });

    const finalEnrollment = await getEnrollmentForUserInCourseInstance({
      user_id: user.user_id,
      course_instance_id: '1',
    });
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.equal(finalEnrollment.joined_at?.getTime(), originalJoinedAt.getTime());
  });
});
