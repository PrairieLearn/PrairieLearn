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

async function createEnrollment({
  userId,
  pendingUid,
  pendingUin,
  status,
}: {
  userId: string | null;
  pendingUid?: string | null;
  pendingUin?: string | null;
  status: EnumEnrollmentStatus;
}): Promise<Enrollment> {
  return await queryRow(
    sql.create_enrollment,
    {
      user_id: userId,
      course_instance_id: '1',
      pending_uid: pendingUid,
      pending_uin: pendingUin,
      status,
      first_joined_at: ['invited', 'rejected'].includes(status) ? null : new Date(),
    },
    EnrollmentSchema,
  );
}

async function selectEnrollments(ids: string[]) {
  return await queryRows(sql.select_enrollments_by_ids, { enrollment_ids: ids }, EnrollmentSchema);
}

async function countAuditEvents(ids: string[]) {
  return await queryScalar(sql.count_enrollment_audit_events, { enrollment_ids: ids }, z.number());
}

describe('Homepage enrollment candidates', () => {
  beforeAll(async () => {
    await helperServer.before()();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$' WHERE id = 1");
    await createInstitution('900002', 'other.example.com', 'Other institution');
  });

  afterAll(helperServer.after);

  it('does not discover or mutate a same-UIN invitation from another institution', async () => {
    const user = await getOrCreateUser({
      uid: 'foreign-uin-invitation@other.example.com',
      name: 'Foreign UIN invitation user',
      uin: 'shared-invitation-uin',
      email: 'foreign-uin-invitation@other.example.com',
      institutionId: '900002',
    });
    const invitation = await createEnrollment({
      userId: null,
      pendingUin: user.uin,
      status: 'invited',
    });

    try {
      const before = await selectEnrollments([invitation.id]);
      const beforeAuditCount = await countAuditEvents([invitation.id]);

      await withUser(user, async () => {
        const response = await fetchCheerio(homeUrl);
        assert.equal(response.status, 200);
        assert.notInclude(response.$('body').text(), 'Available through your institution');
      });

      assert.deepEqual(await selectEnrollments([invitation.id]), before);
      assert.equal(await countAuditEvents([invitation.id]), beforeAuditCount);
    } finally {
      await execute(sql.delete_enrollment_by_id, { enrollment_id: invitation.id });
    }
  });

  it('groups bound-left and pending UIN candidates once using their maximum extension', async () => {
    const user = await getOrCreateUser({
      uid: 'grouped-uin-invitation@example.com',
      name: 'Grouped UIN invitation user',
      uin: 'grouped-invitation-uin',
      email: 'grouped-uin-invitation@example.com',
      institutionId: '1',
    });
    const boundEnrollment = await createEnrollment({
      userId: user.id,
      status: 'left',
    });
    const uinInvitation = await createEnrollment({
      userId: null,
      pendingUin: user.uin,
      status: 'invited',
    });
    const uidInvitation = await createEnrollment({
      userId: null,
      pendingUid: user.uid,
      status: 'invited',
    });
    const enrollmentIds = [boundEnrollment.id, uinInvitation.id, uidInvitation.id];
    const courseInstance = await selectCourseInstanceById('1');
    const now = new Date();
    const expiredExtension = await queryRow(
      sql.create_publishing_extension,
      {
        course_instance_id: '1',
        name: 'Homepage expired candidate extension',
        end_date: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      },
      CourseInstancePublishingExtensionSchema,
    );
    const activeExtension = await queryRow(
      sql.create_publishing_extension,
      {
        course_instance_id: '1',
        name: 'Homepage active candidate extension',
        end_date: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
      CourseInstancePublishingExtensionSchema,
    );
    await execute(sql.add_publishing_extension_enrollment, {
      publishing_extension_id: expiredExtension.id,
      enrollment_id: boundEnrollment.id,
    });
    await execute(sql.add_publishing_extension_enrollment, {
      publishing_extension_id: activeExtension.id,
      enrollment_id: uinInvitation.id,
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
        assert.include(rows.text(), 'Available through your institution');
        assert.lengthOf(
          rows.find('a').filter((_, el) => response.$(el).text().trim() === 'Open course'),
          1,
        );
        assert.lengthOf(rows.find('input[name="__action"][value="accept_invitation"]'), 0);
        assert.lengthOf(rows.find('input[name="__action"][value="reject_invitation"]'), 0);
        assert.lengthOf(
          rows.find('button').filter((_, el) => response.$(el).text().trim() === 'Remove'),
          0,
        );
      });

      assert.deepEqual(await selectEnrollments(enrollmentIds), before);
      assert.equal(await countAuditEvents(enrollmentIds), beforeAuditCount);
    } finally {
      await execute(sql.update_course_instance_publishing, {
        course_instance_id: '1',
        publishing_start_date: courseInstance.publishing_start_date,
        publishing_end_date: courseInstance.publishing_end_date,
      });
      await execute(sql.delete_publishing_extension, {
        publishing_extension_id: activeExtension.id,
      });
      await execute(sql.delete_publishing_extension, {
        publishing_extension_id: expiredExtension.id,
      });
      for (const enrollmentId of enrollmentIds) {
        await execute(sql.delete_enrollment_by_id, { enrollment_id: enrollmentId });
      }
    }
  });

  it('does not substitute a new UID invitation for stale accept or reject targets', async () => {
    const user = await getOrCreateUser({
      uid: 'stale-home-invitation@example.com',
      name: 'Stale homepage invitation user',
      uin: 'stale-home-invitation-uin',
      email: 'stale-home-invitation@example.com',
      institutionId: '1',
    });
    const originalInvitation = await createEnrollment({
      userId: null,
      pendingUid: user.uid,
      status: 'invited',
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
        userId: null,
        pendingUid: user.uid,
        status: 'invited',
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
        courseInstance: await selectCourseInstanceById('1'),
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

  it('accepts and rejects UID invitations for legacy course instances', async () => {
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
      userId: null,
      pendingUid: acceptingUser.uid,
      status: 'invited',
    });
    const rejectingInvitation = await createEnrollment({
      userId: null,
      pendingUid: rejectingUser.uid,
      status: 'invited',
    });
    const courseInstance = await selectCourseInstanceById('1');
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
