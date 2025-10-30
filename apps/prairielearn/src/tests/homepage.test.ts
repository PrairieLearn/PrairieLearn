import fetchCookie from 'fetch-cookie';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authzData.js';
import { config } from '../lib/config.js';
import { type Enrollment, EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  selectOptionalEnrollmentByPendingUid,
  selectOptionalEnrollmentByUserId,
} from '../models/enrollment.js';

import { assertAlert, fetchCheerio } from './helperClient.js';
import * as helperCourse from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';
import { getCsrfToken } from './utils/csrf.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const homeUrl = siteUrl + '/';

/** Helper function to create enrollments with specific statuses for testing */
async function createEnrollmentWithStatus({
  userId,
  courseInstanceId,
  status,
  pendingUid,
}: {
  userId: string | null;
  courseInstanceId: string;
  status: 'invited' | 'joined' | 'blocked' | 'removed' | 'rejected';
  pendingUid?: string | null;
}): Promise<Enrollment> {
  return await queryRow(
    sql.create_enrollment_with_status,
    {
      user_id: userId,
      course_instance_id: courseInstanceId,
      status,
      pending_uid: pendingUid,
      first_joined_at: status === 'joined' ? new Date() : null,
    },
    EnrollmentSchema,
  );
}

describe('Homepage enrollment actions', () => {
  beforeAll(async () => {
    await helperServer.before()();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);

    // Set uid_regexp for the default institution to allow @example.com UIDs
    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$' WHERE id = 1");
  });

  afterAll(helperServer.after);

  it('handles double accept invitation (no-op)', async () => {
    const user = await getOrCreateUser({
      uid: 'invited1@example.com',
      name: 'Invited User 1',
      uin: 'invited1',
      email: 'invited1@example.com',
      institutionId: '1',
    });

    // Create an invited enrollment
    await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      status: 'invited',
      pendingUid: user.uid,
    });

    await withUser(user, async () => {
      const csrfToken = await getCsrfToken(homeUrl);

      // First accept
      const firstResponse = await fetchCheerio(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'accept_invitation',
          course_instance_id: '1',
          __csrf_token: csrfToken,
        }),
      });
      assert.equal(firstResponse.status, 200);
      assert.equal(firstResponse.url, homeUrl);

      // Verify enrollment is now joined
      const courseInstance = await selectCourseInstanceById('1');
      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: user.user_id,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'joined');

      // Second accept (should be a no-op)
      const csrfToken2 = await getCsrfToken(homeUrl);
      const secondResponse = await fetchCheerio(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'accept_invitation',
          course_instance_id: '1',
          __csrf_token: csrfToken2,
        }),
      });
      assert.equal(secondResponse.status, 200);
      assert.equal(secondResponse.url, homeUrl);

      // Verify enrollment is still joined
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: user.user_id,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_user, {
      course_instance_id: '1',
      user_id: user.user_id,
    });
  });

  it('handles double reject invitation (no-op)', async () => {
    const user = await getOrCreateUser({
      uid: 'invited2@example.com',
      name: 'Invited User 2',
      uin: 'invited2',
      email: 'invited2@example.com',
      institutionId: '1',
    });

    // Create an invited enrollment
    await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      status: 'invited',
      pendingUid: user.uid,
    });

    await withUser(user, async () => {
      const csrfToken = await getCsrfToken(homeUrl);

      // First reject
      const firstResponse = await fetchCheerio(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'reject_invitation',
          course_instance_id: '1',
          __csrf_token: csrfToken,
        }),
      });
      assert.equal(firstResponse.status, 200);
      assert.equal(firstResponse.url, homeUrl);

      // Verify enrollment is now rejected
      const courseInstance = await selectCourseInstanceById('1');
      const enrollment = await selectOptionalEnrollmentByPendingUid({
        pendingUid: user.uid,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'rejected');

      // Second reject (should be a no-op)
      const csrfToken2 = await getCsrfToken(homeUrl);
      const secondResponse = await fetchCheerio(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'reject_invitation',
          course_instance_id: '1',
          __csrf_token: csrfToken2,
        }),
      });
      assert.equal(secondResponse.status, 200);
      assert.equal(secondResponse.url, homeUrl);

      // Verify enrollment is still rejected
      const finalEnrollment = await selectOptionalEnrollmentByPendingUid({
        pendingUid: user.uid,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'rejected');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_pending_uid, {
      course_instance_id: '1',
      pending_uid: user.uid,
    });
  });

  it('shows error when rejecting after accepting invitation', async () => {
    const user = await getOrCreateUser({
      uid: 'invited3@example.com',
      name: 'Invited User 3',
      uin: 'invited3',
      email: 'invited3@example.com',
      institutionId: '1',
    });

    // Create an invited enrollment
    await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      status: 'invited',
      pendingUid: user.uid,
    });

    await withUser(user, async () => {
      const fetchWithCookies = fetchCookie(fetch);

      const csrfToken = await getCsrfToken(homeUrl);

      // First accept the invitation
      const acceptResponse = await fetchWithCookies(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'accept_invitation',
          course_instance_id: '1',
          __csrf_token: csrfToken,
        }),
      });
      assert.equal(acceptResponse.status, 200);
      assert.equal(acceptResponse.url, homeUrl);

      // Now try to reject (should fail with error)
      const csrfToken2 = await getCsrfToken(homeUrl);
      const rejectResponse = await fetchWithCookies(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'reject_invitation',
          course_instance_id: '1',
          __csrf_token: csrfToken2,
        }),
      });
      assert.equal(rejectResponse.status, 200);
      assert.equal(rejectResponse.url, homeUrl);

      // Get the HTML to check for flash message
      const rejectResponseText = await rejectResponse.text();
      const cheerio = await import('cheerio');
      const $ = cheerio.load(rejectResponseText);

      // Verify error message is shown
      assertAlert($, 'Failed to reject invitation');

      // Verify enrollment is still joined
      const courseInstance = await selectCourseInstanceById('1');
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: user.user_id,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_user, {
      course_instance_id: '1',
      user_id: user.user_id,
    });
  });

  it('allows accepting invitation after rejecting it', async () => {
    const user = await getOrCreateUser({
      uid: 'invited4@example.com',
      name: 'Invited User 4',
      uin: 'invited4',
      email: 'invited4@example.com',
      institutionId: '1',
    });

    // Create an invited enrollment
    await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      status: 'invited',
      pendingUid: user.uid,
    });

    await withUser(user, async () => {
      const csrfToken = await getCsrfToken(homeUrl);

      // First reject the invitation
      const rejectResponse = await fetchCheerio(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'reject_invitation',
          course_instance_id: '1',
          __csrf_token: csrfToken,
        }),
      });
      assert.equal(rejectResponse.status, 200);
      assert.equal(rejectResponse.url, homeUrl);

      // Verify enrollment is rejected
      const courseInstance = await selectCourseInstanceById('1');
      const rejectedEnrollment = await selectOptionalEnrollmentByPendingUid({
        pendingUid: user.uid,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(rejectedEnrollment);
      assert.equal(rejectedEnrollment.status, 'rejected');

      // Now accept the invitation (should succeed)
      const csrfToken2 = await getCsrfToken(homeUrl);
      const acceptResponse = await fetchCheerio(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'accept_invitation',
          course_instance_id: '1',
          __csrf_token: csrfToken2,
        }),
      });
      assert.equal(acceptResponse.status, 200);
      assert.equal(acceptResponse.url, homeUrl);

      // Verify enrollment is now joined
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: user.user_id,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_user, {
      course_instance_id: '1',
      user_id: user.user_id,
    });
  });

  it('handles double unenroll (no-op)', async () => {
    const user = await getOrCreateUser({
      uid: 'joined1@example.com',
      name: 'Joined User 1',
      uin: 'joined1',
      email: 'joined1@example.com',
      institutionId: '1',
    });

    // Create a joined enrollment
    await createEnrollmentWithStatus({
      userId: user.user_id,
      courseInstanceId: '1',
      status: 'joined',
    });

    await withUser(user, async () => {
      const csrfToken = await getCsrfToken(homeUrl);

      // First unenroll
      const firstResponse = await fetchCheerio(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'unenroll',
          course_instance_id: '1',
          __csrf_token: csrfToken,
        }),
      });
      assert.equal(firstResponse.status, 200);
      assert.equal(firstResponse.url, homeUrl);

      // Verify enrollment is now removed
      const courseInstance = await selectCourseInstanceById('1');
      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: user.user_id,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'removed');

      // Second unenroll (should be a no-op)
      const csrfToken2 = await getCsrfToken(homeUrl);
      const secondResponse = await fetchCheerio(homeUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'unenroll',
          course_instance_id: '1',
          __csrf_token: csrfToken2,
        }),
      });
      assert.equal(secondResponse.status, 200);
      assert.equal(secondResponse.url, homeUrl);

      // Verify enrollment is still removed
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: user.user_id,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requestedRole: 'Student',
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'removed');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_user, {
      course_instance_id: '1',
      user_id: user.user_id,
    });
  });
});
