import * as cheerio from 'cheerio';
import fetchCookie from 'fetch-cookie';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows, queryScalar } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import {
  CourseInstancePublishingExtensionSchema,
  type Enrollment,
  EnrollmentSchema,
  type EnumEnrollmentStatus,
} from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  selectOptionalEnrollmentByPendingUid,
  selectOptionalEnrollmentByUserId,
} from '../models/enrollment.js';

import { assertAlert, fetchCheerio } from './helperClient.js';
import * as helperCourse from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { createInstitution, getOrCreateUser, withUser } from './utils/auth.js';
import { getCsrfToken } from './utils/csrf.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const homeUrl = siteUrl + '/';

async function postHome(body: URLSearchParams) {
  const response = await fetchCookie(fetch)(homeUrl, { method: 'POST', body });
  return { $: cheerio.load(await response.text()), response };
}

/** Helper function to create enrollments with specific statuses for testing */
async function createEnrollmentWithStatus({
  userId,
  courseInstanceId,
  isGuest = false,
  pendingUin,
  status,
  pendingUid,
}: {
  userId: string | null;
  courseInstanceId: string;
  isGuest?: boolean;
  pendingUin?: string | null;
  status: EnumEnrollmentStatus;
  pendingUid?: string | null;
}): Promise<Enrollment> {
  return await queryRow(
    sql.create_enrollment_with_status,
    {
      user_id: userId,
      course_instance_id: courseInstanceId,
      is_guest: isGuest,
      status,
      pending_uid: pendingUid,
      pending_uin: pendingUin,
      first_joined_at: ['invited', 'rejected'].includes(status) ? null : new Date(),
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
    await createInstitution('900002', 'other.example.com', 'Other institution');
  });

  afterAll(helperServer.after);

  it('does not re-accept a joined invitation target', async () => {
    const user = await getOrCreateUser({
      uid: 'invited1@example.com',
      name: 'Invited User 1',
      uin: 'invited1',
      email: 'invited1@example.com',
      institutionId: '1',
    });

    // Create an invited enrollment
    const invitation = await createEnrollmentWithStatus({
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
          enrollment_id: invitation.id,
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

      // The rendered invitation is no longer actionable after acceptance.
      const csrfToken2 = await getCsrfToken(homeUrl);
      const secondResponse = await postHome(
        new URLSearchParams({
          __action: 'accept_invitation',
          course_instance_id: '1',
          enrollment_id: invitation.id,
          __csrf_token: csrfToken2,
        }),
      );
      assert.equal(secondResponse.response.status, 200);
      assert.equal(secondResponse.response.url, homeUrl);
      assertAlert(secondResponse.$, 'Failed to accept invitation');

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

  it('does not re-reject a rejected invitation target', async () => {
    const user = await getOrCreateUser({
      uid: 'invited2@example.com',
      name: 'Invited User 2',
      uin: 'invited2',
      email: 'invited2@example.com',
      institutionId: '1',
    });

    // Create an invited enrollment
    const invitation = await createEnrollmentWithStatus({
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
          enrollment_id: invitation.id,
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

      // The rendered invitation is no longer actionable after rejection.
      const csrfToken2 = await getCsrfToken(homeUrl);
      const secondResponse = await postHome(
        new URLSearchParams({
          __action: 'reject_invitation',
          course_instance_id: '1',
          enrollment_id: invitation.id,
          __csrf_token: csrfToken2,
        }),
      );
      assert.equal(secondResponse.response.status, 200);
      assert.equal(secondResponse.response.url, homeUrl);
      assertAlert(secondResponse.$, 'Failed to reject invitation');

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

  it('shows error when rejecting after accepting invitation', async () => {
    const user = await getOrCreateUser({
      uid: 'invited3@example.com',
      name: 'Invited User 3',
      uin: 'invited3',
      email: 'invited3@example.com',
      institutionId: '1',
    });

    // Create an invited enrollment
    const invitation = await createEnrollmentWithStatus({
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
          enrollment_id: invitation.id,
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
          enrollment_id: invitation.id,
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

  it('does not accept a rejected invitation', async () => {
    const user = await getOrCreateUser({
      uid: 'invited4@example.com',
      name: 'Invited User 4',
      uin: 'invited4',
      email: 'invited4@example.com',
      institutionId: '1',
    });

    // Create an invited enrollment
    const invitation = await createEnrollmentWithStatus({
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
          enrollment_id: invitation.id,
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
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(rejectedEnrollment);
      assert.equal(rejectedEnrollment.status, 'rejected');

      // A rejected invitation is no longer actionable.
      const csrfToken2 = await getCsrfToken(homeUrl);
      const acceptResponse = await postHome(
        new URLSearchParams({
          __action: 'accept_invitation',
          course_instance_id: '1',
          enrollment_id: invitation.id,
          __csrf_token: csrfToken2,
        }),
      );
      assert.equal(acceptResponse.response.status, 200);
      assert.equal(acceptResponse.response.url, homeUrl);

      assertAlert(acceptResponse.$, 'Failed to accept invitation');

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
      const invitation = await createEnrollmentWithStatus({
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

        const postResponse = await postHome(
          new URLSearchParams({
            __action: 'accept_invitation',
            __csrf_token: await getCsrfToken(homeUrl),
            course_instance_id: '1',
            enrollment_id: invitation.id,
          }),
        );
        assert.equal(postResponse.response.status, 403);

        const finalInvitation = await selectOptionalEnrollmentByPendingUid({
          pendingUid: user.uid,
          courseInstance: await selectCourseInstanceById('1'),
          requiredRole: ['System'],
          authzData: dangerousFullSystemAuthz(),
        });
        assert.isNotNull(finalInvitation);
        assert.equal(finalInvitation.status, 'invited');
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

  it('does not discover an equal-UIN roster invitation from another institution', async () => {
    const user = await getOrCreateUser({
      uid: 'foreign-institution@other.example.com',
      name: 'Foreign Institution User',
      uin: 'shared-institution-uin',
      email: 'foreign-institution@other.example.com',
      institutionId: '900002',
    });
    const invitation = await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      pendingUin: user.uin,
      status: 'invited',
    });

    try {
      await withUser(user, async () => {
        const response = await fetchCheerio(homeUrl);
        assert.equal(response.status, 200);
        assert.lengthOf(
          response
            .$('.badge')
            .filter((_, el) => response.$(el).text().includes('Roster invitation')),
          0,
        );
      });
    } finally {
      await execute(sql.delete_enrollment_by_id, { enrollment_id: invitation.id });
    }
  });

  it('renders bound-left plus roster candidates once without mutating them', async () => {
    const user = await getOrCreateUser({
      uid: 'bound-left-roster@example.com',
      name: 'Bound Left Roster User',
      uin: 'bound-left-roster-uin',
      email: 'bound-left-roster@example.com',
      institutionId: '1',
    });
    const boundEnrollment = await createEnrollmentWithStatus({
      userId: user.id,
      courseInstanceId: '1',
      status: 'left',
    });
    const rosterInvitation = await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      pendingUin: user.uin,
      status: 'invited',
    });
    const enrollmentIds = [boundEnrollment.id, rosterInvitation.id];

    try {
      const beforeEnrollments = await queryRows(
        sql.select_enrollments_by_ids,
        { enrollment_ids: enrollmentIds },
        EnrollmentSchema,
      );
      const beforeAuditCount = await queryScalar(
        sql.count_enrollment_audit_events,
        { enrollment_ids: enrollmentIds },
        z.number(),
      );

      await withUser(user, async () => {
        const response = await fetchCheerio(homeUrl);
        const studentRows = response.$(
          'table[aria-label="Courses with student access"] tr, table[aria-label="Courses"] tr',
        );
        assert.lengthOf(studentRows, 1);
        assert.include(studentRows.text(), 'Roster invitation');
        assert.lengthOf(studentRows.find('input[name="__action"][value="accept_invitation"]'), 0);
        assert.lengthOf(studentRows.find('input[name="__action"][value="reject_invitation"]'), 0);
        assert.lengthOf(
          studentRows.find('button').filter((_, el) => response.$(el).text() === 'Remove'),
          0,
        );

        const afterEnrollments = await queryRows(
          sql.select_enrollments_by_ids,
          { enrollment_ids: enrollmentIds },
          EnrollmentSchema,
        );
        const afterAuditCount = await queryScalar(
          sql.count_enrollment_audit_events,
          { enrollment_ids: enrollmentIds },
          z.number(),
        );
        assert.deepEqual(afterEnrollments, beforeEnrollments);
        assert.equal(afterAuditCount, beforeAuditCount);

        const csrfToken = await getCsrfToken(homeUrl);
        const postResponse = await postHome(
          new URLSearchParams({
            __action: 'accept_invitation',
            __csrf_token: csrfToken,
            course_instance_id: '1',
            enrollment_id: rosterInvitation.id,
          }),
        );
        assertAlert(postResponse.$, 'Failed to accept invitation');
      });

      const afterPost = await queryRows(
        sql.select_enrollments_by_ids,
        { enrollment_ids: enrollmentIds },
        EnrollmentSchema,
      );
      assert.deepEqual(afterPost, beforeEnrollments);
    } finally {
      await execute(sql.delete_enrollment_by_id, { enrollment_id: rosterInvitation.id });
      await execute(sql.delete_enrollment_by_id, { enrollment_id: boundEnrollment.id });
    }
  });

  it('uses the latest publishing extension across the complete candidate set', async () => {
    const user = await getOrCreateUser({
      uid: 'candidate-extension@example.com',
      name: 'Candidate Extension User',
      uin: 'candidate-extension-uin',
      email: 'candidate-extension@example.com',
      institutionId: '1',
    });
    const boundEnrollment = await createEnrollmentWithStatus({
      userId: user.id,
      courseInstanceId: '1',
      status: 'left',
    });
    const rosterInvitation = await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      pendingUin: user.uin,
      status: 'invited',
    });
    const existingCourseInstance = await selectCourseInstanceById('1');
    const now = new Date();
    const publishingExtension = await queryRow(
      sql.create_publishing_extension,
      {
        course_instance_id: '1',
        name: 'Homepage complete candidate extension',
        end_date: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
      CourseInstancePublishingExtensionSchema,
    );
    await execute(sql.add_publishing_extension_enrollment, {
      publishing_extension_id: publishingExtension.id,
      enrollment_id: rosterInvitation.id,
    });
    await execute(sql.update_course_instance_publishing, {
      course_instance_id: '1',
      publishing_start_date: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      publishing_end_date: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });

    try {
      await withUser(user, async () => {
        const enrollmentIds = [boundEnrollment.id, rosterInvitation.id];
        const beforeEnrollments = await queryRows(
          sql.select_enrollments_by_ids,
          { enrollment_ids: enrollmentIds },
          EnrollmentSchema,
        );
        const beforeAuditCount = await queryScalar(
          sql.count_enrollment_audit_events,
          { enrollment_ids: enrollmentIds },
          z.number(),
        );

        const response = await fetchCheerio(homeUrl);
        const studentRows = response.$(
          'table[aria-label="Courses with student access"] tr, table[aria-label="Courses"] tr',
        );
        assert.lengthOf(studentRows, 1);
        assert.include(studentRows.text(), 'Roster invitation');
        assert.lengthOf(studentRows.find('input[name="__action"][value="accept_invitation"]'), 0);
        assert.lengthOf(studentRows.find('input[name="__action"][value="reject_invitation"]'), 0);
        assert.lengthOf(
          studentRows.find('button').filter((_, el) => response.$(el).text() === 'Remove'),
          0,
        );

        assert.deepEqual(
          await queryRows(
            sql.select_enrollments_by_ids,
            { enrollment_ids: enrollmentIds },
            EnrollmentSchema,
          ),
          beforeEnrollments,
        );
        assert.equal(
          await queryScalar(
            sql.count_enrollment_audit_events,
            { enrollment_ids: enrollmentIds },
            z.number(),
          ),
          beforeAuditCount,
        );

        const openCourseLink = studentRows
          .find('a')
          .filter((_, el) => response.$(el).text().trim() === 'Open course');
        assert.lengthOf(openCourseLink, 1);
        const openCourseHref = openCourseLink.attr('href');
        assert.isString(openCourseHref);

        const courseResponse = await fetchCheerio(new URL(openCourseHref!, siteUrl));
        assert.equal(courseResponse.status, 200);

        const courseInstance = await selectCourseInstanceById('1');
        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          userId: user.id,
          courseInstance,
          requiredRole: ['System'],
          authzData: dangerousFullSystemAuthz(),
        });
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.id, boundEnrollment.id);
        assert.equal(finalEnrollment.status, 'joined');
        assert.equal(
          await queryScalar(
            sql.select_publishing_extension_enrollment_id,
            { publishing_extension_id: publishingExtension.id },
            z.string(),
          ),
          boundEnrollment.id,
        );
      });
    } finally {
      await execute(sql.update_course_instance_publishing, {
        course_instance_id: '1',
        publishing_start_date: existingCourseInstance.publishing_start_date,
        publishing_end_date: existingCourseInstance.publishing_end_date,
      });
      await execute(sql.delete_publishing_extension, {
        publishing_extension_id: publishingExtension.id,
      });
      await execute(sql.delete_enrollment_by_id, { enrollment_id: rosterInvitation.id });
      await execute(sql.delete_enrollment_by_id, { enrollment_id: boundEnrollment.id });
    }
  });

  it('accepts an extension-backed conventional invitation after the base interval', async () => {
    const user = await getOrCreateUser({
      uid: 'conventional-extension@example.com',
      name: 'Conventional Extension User',
      uin: 'conventional-extension-uin',
      email: 'conventional-extension@example.com',
      institutionId: '1',
    });
    const invitation = await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      pendingUid: user.uid,
      status: 'invited',
    });
    const existingCourseInstance = await selectCourseInstanceById('1');
    const now = new Date();
    const publishingExtension = await queryRow(
      sql.create_publishing_extension,
      {
        course_instance_id: '1',
        name: 'Homepage conventional invitation extension',
        end_date: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
      CourseInstancePublishingExtensionSchema,
    );
    await execute(sql.add_publishing_extension_enrollment, {
      publishing_extension_id: publishingExtension.id,
      enrollment_id: invitation.id,
    });
    await execute(sql.update_course_instance_publishing, {
      course_instance_id: '1',
      publishing_start_date: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      publishing_end_date: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });

    try {
      await withUser(user, async () => {
        const page = await fetchCheerio(homeUrl);
        const acceptForm = page
          .$(`input[name="enrollment_id"][value="${invitation.id}"]`)
          .closest('form');
        assert.equal(acceptForm.find('input[name="__action"]').attr('value'), 'accept_invitation');

        const response = await postHome(
          new URLSearchParams({
            __action: 'accept_invitation',
            __csrf_token: await getCsrfToken(homeUrl),
            course_instance_id: '1',
            enrollment_id: invitation.id,
          }),
        );
        assert.equal(response.response.status, 200);
        assert.equal(response.response.url, homeUrl);

        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          userId: user.id,
          courseInstance: await selectCourseInstanceById('1'),
          requiredRole: ['System'],
          authzData: dangerousFullSystemAuthz(),
        });
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.id, invitation.id);
        assert.equal(finalEnrollment.status, 'joined');
      });
    } finally {
      await execute(sql.update_course_instance_publishing, {
        course_instance_id: '1',
        publishing_start_date: existingCourseInstance.publishing_start_date,
        publishing_end_date: existingCourseInstance.publishing_end_date,
      });
      await execute(sql.delete_publishing_extension, {
        publishing_extension_id: publishingExtension.id,
      });
      await execute(sql.delete_enrollment_by_id, { enrollment_id: invitation.id });
    }
  });

  it('does not substitute a new conventional invitation for a stale form target', async () => {
    const user = await getOrCreateUser({
      uid: 'stale-invitation@example.com',
      name: 'Stale Invitation User',
      uin: 'stale-invitation-uin',
      email: 'stale-invitation@example.com',
      institutionId: '1',
    });
    const originalInvitation = await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      pendingUid: user.uid,
      status: 'invited',
    });
    let replacementInvitation: Enrollment | null = null;

    try {
      await withUser(user, async () => {
        const page = await fetchCheerio(homeUrl);
        const acceptForm = page
          .$(`input[name="enrollment_id"][value="${originalInvitation.id}"]`)
          .closest('form');
        assert.equal(acceptForm.find('input[name="__action"]').attr('value'), 'accept_invitation');
      });

      await execute(sql.delete_enrollment_by_id, {
        enrollment_id: originalInvitation.id,
      });
      replacementInvitation = await createEnrollmentWithStatus({
        userId: null,
        courseInstanceId: '1',
        pendingUid: user.uid,
        status: 'invited',
      });

      await withUser(user, async () => {
        const csrfToken = await getCsrfToken(homeUrl);
        const response = await postHome(
          new URLSearchParams({
            __action: 'accept_invitation',
            __csrf_token: csrfToken,
            course_instance_id: '1',
            enrollment_id: originalInvitation.id,
          }),
        );
        assertAlert(response.$, 'Failed to accept invitation');

        const rejectCsrfToken = await getCsrfToken(homeUrl);
        const rejectResponse = await postHome(
          new URLSearchParams({
            __action: 'reject_invitation',
            __csrf_token: rejectCsrfToken,
            course_instance_id: '1',
            enrollment_id: originalInvitation.id,
          }),
        );
        assertAlert(rejectResponse.$, 'Failed to reject invitation');
      });

      const courseInstance = await selectCourseInstanceById('1');
      const remainingInvitation = await selectOptionalEnrollmentByPendingUid({
        pendingUid: user.uid,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(remainingInvitation);
      assert.equal(remainingInvitation.id, replacementInvitation.id);
      assert.equal(remainingInvitation.status, 'invited');
    } finally {
      if (replacementInvitation !== null) {
        await execute(sql.delete_enrollment_by_id, {
          enrollment_id: replacementInvitation.id,
        });
      } else {
        await execute(sql.delete_enrollment_by_id, {
          enrollment_id: originalInvitation.id,
        });
      }
    }
  });

  it('does not accept bound left, removed, or blocked enrollments as invitations', async () => {
    for (const status of ['left', 'removed', 'blocked'] as const) {
      const user = await getOrCreateUser({
        uid: `non-actionable-${status}@example.com`,
        name: `Non-actionable ${status}`,
        uin: `non-actionable-${status}-uin`,
        email: `non-actionable-${status}@example.com`,
        institutionId: '1',
      });
      const enrollment = await createEnrollmentWithStatus({
        userId: user.id,
        courseInstanceId: '1',
        status,
      });

      try {
        await withUser(user, async () => {
          const csrfToken = await getCsrfToken(homeUrl);
          const response = await postHome(
            new URLSearchParams({
              __action: 'accept_invitation',
              __csrf_token: csrfToken,
              course_instance_id: '1',
              enrollment_id: enrollment.id,
            }),
          );
          assertAlert(response.$, 'Failed to accept invitation');
        });

        const courseInstance = await selectCourseInstanceById('1');
        const finalEnrollment = await selectOptionalEnrollmentByUserId({
          userId: user.id,
          courseInstance,
          requiredRole: ['System'],
          authzData: dangerousFullSystemAuthz(),
        });
        assert.isNotNull(finalEnrollment);
        assert.equal(finalEnrollment.status, status);
      } finally {
        await execute(sql.delete_enrollment_by_id, { enrollment_id: enrollment.id });
      }
    }
  });

  it('preserves actionable conventional guest invitation acceptance', async () => {
    const user = await getOrCreateUser({
      uid: 'guest-invitation@example.com',
      name: 'Guest Invitation User',
      uin: 'guest-invitation-uin',
      email: 'guest-invitation@example.com',
      institutionId: '1',
    });
    const invitation = await createEnrollmentWithStatus({
      userId: null,
      courseInstanceId: '1',
      isGuest: true,
      pendingUid: user.uid,
      status: 'invited',
    });

    try {
      await withUser(user, async () => {
        const page = await fetchCheerio(homeUrl);
        assert.equal(
          page
            .$(`input[name="enrollment_id"][value="${invitation.id}"]`)
            .closest('form')
            .find('input[name="__action"]')
            .attr('value'),
          'accept_invitation',
        );

        const csrfToken = await getCsrfToken(homeUrl);
        const response = await fetchCheerio(homeUrl, {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'accept_invitation',
            __csrf_token: csrfToken,
            course_instance_id: '1',
            enrollment_id: invitation.id,
          }),
        });
        assert.equal(response.status, 200);
      });

      const courseInstance = await selectCourseInstanceById('1');
      const enrollment = await selectOptionalEnrollmentByUserId({
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'joined');
      assert.isTrue(enrollment.is_guest);
    } finally {
      await execute(sql.delete_enrollment_by_id, { enrollment_id: invitation.id });
    }
  });
});
