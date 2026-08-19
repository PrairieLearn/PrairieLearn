import fetchCookie from 'fetch-cookie';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { type Enrollment, EnrollmentSchema, type EnumEnrollmentStatus } from '../lib/db-types.js';
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
import {
  createEnrollment,
  createLti13CourseInstance,
  selectEnrollments,
} from './utils/enrollment-identity.js';

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
  status: EnumEnrollmentStatus;
  pendingUid?: string | null;
}): Promise<Enrollment> {
  return await queryRow(
    sql.create_enrollment_with_status,
    {
      user_id: userId,
      course_instance_id: courseInstanceId,
      status,
      pending_uid: pendingUid,
      first_joined_at: ['joined', 'left', 'removed', 'blocked'].includes(status)
        ? new Date()
        : null,
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
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
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
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_user, {
      course_instance_id: '1',
      user_id: user.id,
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
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
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
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'rejected');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_pending_uid, {
      course_instance_id: '1',
      pending_uid: user.uid,
    });
  });

  it('does not show or reject an LTI invitation that only matches by UID', async () => {
    const user = await getOrCreateUser({
      uid: 'lti-uid-only@example.com',
      name: 'UID-only LTI user',
      uin: 'different-uin',
      email: 'lti-uid-only@example.com',
      institutionId: '1',
    });
    const courseInstance = await selectCourseInstanceById('1');
    const lti13CourseInstance = await createLti13CourseInstance(courseInstance);
    const invitation = await createEnrollment({
      courseInstance,
      pendingLti13CourseInstanceId: lti13CourseInstance.id,
      pendingLti13Sub: 'rightful-student-sub',
      pendingUid: user.uid,
      pendingUin: 'rightful-student-uin',
    });

    try {
      await withUser(user, async () => {
        const page = await fetchCheerio(homeUrl);
        assert.lengthOf(
          page.$(`form:has(input[name="course_instance_id"][value="${courseInstance.id}"])`),
          0,
        );

        const response = await fetchCheerio(homeUrl, {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'reject_invitation',
            course_instance_id: courseInstance.id,
            __csrf_token: await getCsrfToken(homeUrl),
          }),
        });
        assert.equal(response.status, 200);
        assertAlert(response.$, 'Failed to reject invitation');
      });

      const enrollments = await selectEnrollments([invitation.id]);
      assert.lengthOf(enrollments, 1);
      assert.equal(enrollments[0].status, 'invited');
    } finally {
      await execute(sql.delete_lti13_course_instance, {
        lti13_course_instance_id: lti13CourseInstance.id,
      });
    }
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
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'joined');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_user, {
      course_instance_id: '1',
      user_id: user.id,
    });
  });

  it.each(['left', 'removed', 'rejected'] as const)(
    'does not treat a %s enrollment as an invitation',
    async (status) => {
      const user = await getOrCreateUser({
        uid: `non-actionable-${status}@example.com`,
        name: `Non-actionable ${status} user`,
        uin: `non-actionable-${status}`,
        email: `non-actionable-${status}@example.com`,
        institutionId: '1',
      });
      const isPending = status === 'rejected';
      await createEnrollmentWithStatus({
        userId: isPending ? null : user.id,
        courseInstanceId: '1',
        status,
        pendingUid: isPending ? user.uid : null,
      });

      try {
        await withUser(user, async () => {
          const fetchWithCookies = fetchCookie(fetch);
          const response = await fetchWithCookies(homeUrl, {
            method: 'POST',
            body: new URLSearchParams({
              __action: 'accept_invitation',
              course_instance_id: '1',
              __csrf_token: await getCsrfToken(homeUrl),
            }),
          });
          assert.equal(response.status, 200);
          const $ = (await import('cheerio')).load(await response.text());
          assertAlert($, 'Failed to accept invitation');

          const courseInstance = await selectCourseInstanceById('1');
          const enrollment = isPending
            ? await selectOptionalEnrollmentByPendingUid({
                pendingUid: user.uid,
                courseInstance,
                requiredRole: ['System'],
                authzData: dangerousFullSystemAuthz(),
              })
            : await selectOptionalEnrollmentByUserId({
                userId: user.id,
                courseInstance,
                requiredRole: ['System'],
                authzData: dangerousFullSystemAuthz(),
              });
          assert.isNotNull(enrollment);
          assert.equal(enrollment.status, status);
        });
      } finally {
        if (isPending) {
          await execute(sql.delete_enrollment_by_course_instance_and_pending_uid, {
            course_instance_id: '1',
            pending_uid: user.uid,
          });
        } else {
          await execute(sql.delete_enrollment_by_course_instance_and_user, {
            course_instance_id: '1',
            user_id: user.id,
          });
        }
      }
    },
  );

  it('does not show invited course that is not published', async () => {
    const user = await getOrCreateUser({
      uid: 'invited5@example.com',
      name: 'Invited User 5',
      uin: 'invited5',
      email: 'invited5@example.com',
      institutionId: '1',
    });

    const futureStart = new Date();
    futureStart.setFullYear(futureStart.getFullYear() + 1);
    const futureEnd = new Date();
    futureEnd.setFullYear(futureEnd.getFullYear() + 2);

    const existingCourseInstance = await selectCourseInstanceById('1');
    assert.isNotNull(existingCourseInstance);
    assert.equal(existingCourseInstance.modern_publishing, true);
    assert.isNotNull(existingCourseInstance.publishing_start_date);
    assert.isNotNull(existingCourseInstance.publishing_end_date);

    await execute(sql.update_course_instance_publishing, {
      course_instance_id: '1',
      publishing_start_date: futureStart,
      publishing_end_date: futureEnd,
    });

    try {
      // Create an invited enrollment
      await createEnrollmentWithStatus({
        userId: null,
        courseInstanceId: '1',
        status: 'invited',
        pendingUid: user.uid,
      });

      await withUser(user, async () => {
        const response = await fetchCheerio(homeUrl);
        assert.equal(response.status, 200);

        const studentCoursesTable = response.$(
          'table[aria-label="Courses with student access"], table[aria-label="Courses"]',
        );

        const studentRows = studentCoursesTable.find('tr');
        assert.equal(studentRows.length, 0, 'No course rows should be visible');
      });
    } finally {
      await execute(sql.delete_enrollment_by_course_instance_and_pending_uid, {
        course_instance_id: '1',
        pending_uid: user.uid,
      });

      await execute(sql.update_course_instance_publishing, {
        course_instance_id: '1',
        publishing_start_date: existingCourseInstance.publishing_start_date,
        publishing_end_date: existingCourseInstance.publishing_end_date,
      });
    }
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
      userId: user.id,
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

      // Verify enrollment is now left
      const courseInstance = await selectCourseInstanceById('1');
      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'left');

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

      // Verify enrollment is still left
      const finalEnrollment = await selectOptionalEnrollmentByUserId({
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(finalEnrollment);
      assert.equal(finalEnrollment.status, 'left');
    });

    await execute(sql.delete_enrollment_by_course_instance_and_user, {
      course_instance_id: '1',
      user_id: user.id,
    });
  });
});
