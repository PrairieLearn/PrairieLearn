import * as cheerio from 'cheerio';
import fetchCookie from 'fetch-cookie';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { type Enrollment } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import {
  createPublishingExtensionWithEnrollments,
  deletePublishingExtension,
} from '../models/course-instance-publishing-extensions.js';
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
import {
  createEnrollment,
  createLti13CourseInstance,
  selectEnrollments,
} from './utils/enrollment-identity.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const homeUrl = siteUrl + '/';

async function postHome(body: URLSearchParams) {
  const response = await fetchCookie(fetch)(homeUrl, { method: 'POST', body });
  return { $: cheerio.load(await response.text()), response };
}

async function countAuditEvents(ids: string[]) {
  return await queryScalar(sql.count_enrollment_audit_events, { enrollment_ids: ids }, z.number());
}

describe('Homepage student courses', () => {
  beforeAll(async () => {
    await helperServer.before()();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$' WHERE id = 1");
    await createInstitution('900002', 'other.example.com', 'Other institution');
  });

  afterAll(helperServer.after);

  it('does not discover or mutate a same-UIN invitation from another institution', async () => {
    const courseInstance = await selectCourseInstanceById('1');
    const user = await getOrCreateUser({
      uid: 'foreign-uin-invitation@other.example.com',
      name: 'Foreign UIN invitation user',
      uin: 'shared-invitation-uin',
      email: 'foreign-uin-invitation@other.example.com',
      institutionId: '900002',
    });
    const invitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });

    try {
      const before = await selectEnrollments([invitation.id]);
      const beforeAuditCount = await countAuditEvents([invitation.id]);

      await withUser(user, async () => {
        const response = await fetchCheerio(homeUrl);
        assert.equal(response.status, 200);
        assert.lengthOf(
          response.$(
            'table[aria-label="Courses with student access"] tr, table[aria-label="Courses"] tr',
          ),
          0,
        );
      });

      assert.deepEqual(await selectEnrollments([invitation.id]), before);
      assert.equal(await countAuditEvents([invitation.id]), beforeAuditCount);
    } finally {
      await execute(sql.delete_enrollment_by_id, { enrollment_id: invitation.id });
    }
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

        const response = await postHome(
          new URLSearchParams({
            __action: 'reject_invitation',
            __csrf_token: await getCsrfToken(homeUrl),
            course_instance_id: courseInstance.id,
            enrollment_id: invitation.id,
          }),
        );
        assertAlert(response.$, 'Failed to reject invitation');
      });

      const [persistedInvitation] = await selectEnrollments([invitation.id]);
      assert.equal(persistedInvitation.status, 'invited');
    } finally {
      await execute(sql.delete_lti13_course_instance, {
        lti13_course_instance_id: lti13CourseInstance.id,
      });
    }
  });

  it('shows a left enrollment and matching UIN invitation once with their latest extension', async () => {
    const courseInstance = await selectCourseInstanceById('1');
    const lti13CourseInstance = await createLti13CourseInstance(courseInstance);
    const user = await getOrCreateUser({
      uid: 'grouped-uin-invitation@example.com',
      name: 'Grouped UIN invitation user',
      uin: 'grouped-invitation-uin',
      email: 'grouped-uin-invitation@example.com',
      institutionId: '1',
    });
    const boundEnrollment = await createEnrollment({
      courseInstance,
      firstJoinedAt: new Date(),
      userId: user.id,
      status: 'left',
    });
    const uinInvitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const ltiLinkedUidCandidate = await createEnrollment({
      courseInstance,
      pendingLti13CourseInstanceId: lti13CourseInstance.id,
      pendingLti13Sub: 'grouped-lti-sub',
      pendingUid: user.uid,
      pendingUin: 'grouped-lti-uin',
    });
    const enrollmentIds = [boundEnrollment.id, uinInvitation.id, ltiLinkedUidCandidate.id];
    const now = new Date();
    const expiredExtension = await createPublishingExtensionWithEnrollments({
      courseInstance,
      name: 'Homepage bound enrollment extension',
      endDate: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      enrollments: [boundEnrollment],
    });
    const activeExtension = await createPublishingExtensionWithEnrollments({
      courseInstance,
      name: 'Homepage LTI-linked UID candidate extension',
      endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      enrollments: [ltiLinkedUidCandidate],
    });
    await execute(sql.update_course_instance_publishing, {
      course_instance_id: '1',
      publishing_start_date: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      publishing_end_date: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });

    try {
      const before = await selectEnrollments(enrollmentIds);
      const beforeAuditCount = await countAuditEvents(enrollmentIds);

      await withUser(user, async () => {
        const response = await fetchCheerio(homeUrl);
        const rows = response.$(
          'table[aria-label="Courses with student access"] tr, table[aria-label="Courses"] tr',
        );
        assert.lengthOf(rows, 1);
        assert.lengthOf(rows.find(`a[href="/pl/course_instance/${courseInstance.id}"]`), 1);
        assert.notInclude(rows.text(), 'Available through your institution');
        assert.notInclude(rows.text(), 'Open course');
        assert.lengthOf(rows.find('input[name="__action"][value="accept_invitation"]'), 0);
        assert.lengthOf(rows.find('input[name="__action"][value="reject_invitation"]'), 0);
        assert.lengthOf(
          rows.find('button').filter((_, el) => response.$(el).text().trim() === 'Remove'),
          1,
        );
      });

      assert.deepEqual(await selectEnrollments(enrollmentIds), before);
      assert.equal(await countAuditEvents(enrollmentIds), beforeAuditCount);

      await withUser(user, async () => {
        const response = await postHome(
          new URLSearchParams({
            __action: 'remove_institution_access',
            __csrf_token: await getCsrfToken(homeUrl),
            course_instance_id: courseInstance.id,
            enrollment_id: uinInvitation.id,
          }),
        );
        assert.notInclude(response.$('body').text(), 'Failed to remove course');
      });

      const [updatedBoundEnrollment, updatedUinInvitation, updatedLtiLinkedUidCandidate] =
        await selectEnrollments(enrollmentIds);
      assert.equal(updatedBoundEnrollment.status, 'left');
      assert.equal(updatedUinInvitation.status, 'rejected');
      assert.equal(updatedLtiLinkedUidCandidate.status, 'invited');
      assert.equal(await countAuditEvents(enrollmentIds), beforeAuditCount + 1);
    } finally {
      await execute(sql.update_course_instance_publishing, {
        course_instance_id: '1',
        publishing_start_date: courseInstance.publishing_start_date,
        publishing_end_date: courseInstance.publishing_end_date,
      });
      await deletePublishingExtension({
        extension: activeExtension,
        courseInstance,
      });
      await deletePublishingExtension({
        extension: expiredExtension,
        courseInstance,
      });
      for (const enrollmentId of enrollmentIds) {
        await execute(sql.delete_enrollment_by_id, { enrollment_id: enrollmentId });
      }
      await execute(sql.delete_lti13_course_instance, {
        lti13_course_instance_id: lti13CourseInstance.id,
      });
    }
  });

  it("does not use a pending invitation's extension after the user has joined", async () => {
    const courseInstance = await selectCourseInstanceById('1');
    const now = new Date();
    const user = await getOrCreateUser({
      uid: 'joined-with-pending-invitation@example.com',
      name: 'Joined with pending invitation user',
      uin: 'joined-with-pending-invitation-uin',
      email: 'joined-with-pending-invitation@example.com',
      institutionId: '1',
    });
    const joinedEnrollment = await createEnrollment({
      courseInstance,
      firstJoinedAt: new Date(),
      userId: user.id,
      status: 'joined',
    });
    const pendingInvitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const extension = await createPublishingExtensionWithEnrollments({
      courseInstance,
      name: 'Homepage stale pending invitation extension',
      endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      enrollments: [pendingInvitation],
    });
    await execute(sql.update_course_instance_publishing, {
      course_instance_id: courseInstance.id,
      publishing_start_date: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      publishing_end_date: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });

    try {
      await withUser(user, async () => {
        const response = await fetchCheerio(homeUrl);
        const rows = response.$(
          'table[aria-label="Courses with student access"] tr, table[aria-label="Courses"] tr',
        );
        assert.lengthOf(rows, 0);
      });
    } finally {
      await execute(sql.update_course_instance_publishing, {
        course_instance_id: courseInstance.id,
        publishing_start_date: courseInstance.publishing_start_date,
        publishing_end_date: courseInstance.publishing_end_date,
      });
      await deletePublishingExtension({ extension, courseInstance });
      await execute(sql.delete_enrollment_by_id, { enrollment_id: joinedEnrollment.id });
      await execute(sql.delete_enrollment_by_id, { enrollment_id: pendingInvitation.id });
    }
  });

  it('does not substitute a new UID invitation for stale accept or reject targets', async () => {
    const courseInstance = await selectCourseInstanceById('1');
    const user = await getOrCreateUser({
      uid: 'stale-home-invitation@example.com',
      name: 'Stale homepage invitation user',
      uin: 'stale-home-invitation-uin',
      email: 'stale-home-invitation@example.com',
      institutionId: '1',
    });
    const originalInvitation = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
    });
    let replacementInvitation: Enrollment | null = null;

    try {
      await withUser(user, async () => {
        const page = await fetchCheerio(homeUrl);
        const invitationIdInput = page.$(
          `input[name="enrollment_id"][value="${originalInvitation.id}"]`,
        );
        assert.lengthOf(invitationIdInput, 1);
        assert.equal(
          invitationIdInput.closest('form').find('input[name="__action"]').attr('value'),
          'accept_invitation',
        );
      });

      await execute(sql.delete_enrollment_by_id, { enrollment_id: originalInvitation.id });
      replacementInvitation = await createEnrollment({
        courseInstance,
        pendingUid: user.uid,
      });

      await withUser(user, async () => {
        const acceptResponse = await postHome(
          new URLSearchParams({
            __action: 'accept_invitation',
            __csrf_token: await getCsrfToken(homeUrl),
            course_instance_id: '1',
            enrollment_id: originalInvitation.id,
          }),
        );
        assertAlert(acceptResponse.$, 'Failed to accept invitation');

        const rejectResponse = await postHome(
          new URLSearchParams({
            __action: 'reject_invitation',
            __csrf_token: await getCsrfToken(homeUrl),
            course_instance_id: '1',
            enrollment_id: originalInvitation.id,
          }),
        );
        assertAlert(rejectResponse.$, 'Failed to reject invitation');
      });

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
      await execute(sql.delete_enrollment_by_id, {
        enrollment_id: replacementInvitation?.id ?? originalInvitation.id,
      });
    }
  });

  it.each(['left', 'removed', 'rejected'] as const)(
    'does not treat a %s enrollment as a UID invitation',
    async (status) => {
      const courseInstance = await selectCourseInstanceById('1');
      const user = await getOrCreateUser({
        uid: `non-actionable-${status}@example.com`,
        name: `Non-actionable ${status} user`,
        uin: `non-actionable-${status}`,
        email: `non-actionable-${status}@example.com`,
        institutionId: '1',
      });
      const enrollment = await createEnrollment({
        courseInstance,
        firstJoinedAt: status === 'rejected' ? null : new Date(),
        userId: status === 'rejected' ? null : user.id,
        pendingUid: status === 'rejected' ? user.uid : null,
        status,
      });

      try {
        await withUser(user, async () => {
          const response = await postHome(
            new URLSearchParams({
              __action: 'accept_invitation',
              __csrf_token: await getCsrfToken(homeUrl),
              course_instance_id: '1',
              enrollment_id: enrollment.id,
            }),
          );
          assertAlert(response.$, 'Failed to accept invitation');
        });

        const [persistedEnrollment] = await selectEnrollments([enrollment.id]);
        assert.equal(persistedEnrollment.status, status);
        assert.equal(persistedEnrollment.user_id, status === 'rejected' ? null : user.id);
      } finally {
        await execute(sql.delete_enrollment_by_id, { enrollment_id: enrollment.id });
      }
    },
  );

  it('accepts and rejects UID invitations for legacy course instances', async () => {
    const courseInstance = await selectCourseInstanceById('1');
    const acceptingUser = await getOrCreateUser({
      uid: 'legacy-accept@example.com',
      name: 'Legacy accept user',
      uin: 'legacy-accept-uin',
      email: 'legacy-accept@example.com',
      institutionId: '1',
    });
    const rejectingUser = await getOrCreateUser({
      uid: 'legacy-reject@example.com',
      name: 'Legacy reject user',
      uin: 'legacy-reject-uin',
      email: 'legacy-reject@example.com',
      institutionId: '1',
    });
    const acceptingInvitation = await createEnrollment({
      courseInstance,
      pendingUid: acceptingUser.uid,
    });
    const rejectingInvitation = await createEnrollment({
      courseInstance,
      pendingUid: rejectingUser.uid,
    });
    const accessRule = await queryRow(
      sql.create_unrestricted_access_rule,
      { course_instance_id: '1' },
      z.object({ id: z.string() }),
    );
    await execute(sql.update_modern_publishing, {
      course_instance_id: '1',
      modern_publishing: false,
    });

    try {
      await withUser(acceptingUser, async () => {
        const response = await postHome(
          new URLSearchParams({
            __action: 'accept_invitation',
            __csrf_token: await getCsrfToken(homeUrl),
            course_instance_id: '1',
            enrollment_id: acceptingInvitation.id,
          }),
        );
        assert.notInclude(response.$('body').text(), 'Failed to accept invitation');
      });
      const acceptedEnrollment = await selectOptionalEnrollmentByUserId({
        userId: acceptingUser.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(acceptedEnrollment);
      assert.equal(acceptedEnrollment.status, 'joined');

      await withUser(rejectingUser, async () => {
        const response = await postHome(
          new URLSearchParams({
            __action: 'reject_invitation',
            __csrf_token: await getCsrfToken(homeUrl),
            course_instance_id: '1',
            enrollment_id: rejectingInvitation.id,
          }),
        );
        assert.notInclude(response.$('body').text(), 'Failed to reject invitation');
      });
      const rejectedEnrollment = await selectOptionalEnrollmentByPendingUid({
        pendingUid: rejectingUser.uid,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(rejectedEnrollment);
      assert.equal(rejectedEnrollment.status, 'rejected');
    } finally {
      await execute(sql.update_modern_publishing, {
        course_instance_id: '1',
        modern_publishing: courseInstance.modern_publishing,
      });
      await execute(sql.delete_access_rule, { access_rule_id: accessRule.id });
      await execute(sql.delete_enrollment_by_id, { enrollment_id: acceptingInvitation.id });
      await execute(sql.delete_enrollment_by_id, { enrollment_id: rejectingInvitation.id });
    }
  });
});
