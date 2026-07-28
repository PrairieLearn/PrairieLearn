import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  AssessmentAccessControlRuleSchema,
  type CourseInstance,
  CourseInstancePublishingExtensionSchema,
  StudentLabelSchema,
} from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';

import { selectAssessmentByTid } from './assessment.js';
import { insertAuditEvent, selectAuditEventsByEnrollmentId } from './audit-event.js';
import { selectCourseInstanceById } from './course-instances.js';
import {
  selectEnrollmentAdmissionDecision,
  selectEnrollmentIdentityClassification,
} from './enrollment-identity.js';
import {
  EnrollmentAdmissionBlockedError,
  admitUserFromEnrollmentInvitation,
  admitUserToCourseInstance,
  reconcileEnrollmentIdentities,
} from './enrollment-reconciliation.js';
import {
  actorFor,
  checkedAdmissionFor,
  createEnrollment,
  createLti13CourseInstance,
  createUser,
  nextFixtureName,
  nextFixtureNumber,
  selectEnrollments,
  selectReconciliationAuditEvents,
} from './enrollment-reconciliation.test-helpers.js';

const sql = loadSqlEquiv(import.meta.url);

async function selectIds(query: string, params: Record<string, unknown>): Promise<string[]> {
  return (await queryRows(query, params, z.object({ id: IdSchema }))).map((row) => row.id);
}

describe('enrollment reconciliation and admission behavior', { concurrent: false }, () => {
  let courseInstance: CourseInstance;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
  });

  afterAll(helperDb.after);

  it('keeps pending-only reconciliation pending and uses the lowest ID absent a sole guest', async () => {
    const user = await createUser({ prefix: 'pending-only' });
    const lower = await createEnrollment({
      courseInstance,
      status: 'rejected',
      pendingUid: user.uid,
    });
    const higher = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
      pendingName: 'Roster display name',
      pendingEmail: 'roster-display@example.com',
    });

    const result = await reconcileEnrollmentIdentities({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      ...actorFor(user),
    });

    expect(result.enrollment).toMatchObject({
      id: lower.id,
      pending_email: 'roster-display@example.com',
      pending_name: 'Roster display name',
      pending_uid: user.uid,
      pending_uin: user.uin,
      status: 'invited',
      user_id: null,
    });
    expect(result.mergedEnrollmentIds).toEqual([higher.id]);
    expect(await selectEnrollments([lower.id, higher.id])).toHaveLength(1);
  });

  it('keeps a retained LTI association coupled to its source UIN', async () => {
    const user = await createUser({ prefix: 'lti-uin-coupling' });
    const lti13CourseInstance = await createLti13CourseInstance(courseInstance);
    const conventional = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingUin: nextFixtureName('stale-conventional-uin'),
    });
    const ltiInvitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
      pendingLti13CourseInstanceId: lti13CourseInstance.id,
      pendingLti13Sub: 'coupled-sub',
    });

    const result = await reconcileEnrollmentIdentities({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      lti13Identity: {
        lti13CourseInstanceId: lti13CourseInstance.id,
        sub: 'coupled-sub',
      },
      ...actorFor(user),
    });

    expect(result.enrollment).toMatchObject({
      id: conventional.id,
      pending_lti13_course_instance_id: lti13CourseInstance.id,
      pending_lti13_sub: 'coupled-sub',
      pending_uid: user.uid,
      pending_uin: user.uin,
    });
    expect(result.mergedEnrollmentIds).toEqual([ltiInvitation.id]);
  });

  it('uses the sole guest survivor and keeps guest status sticky', async () => {
    const user = await createUser({ prefix: 'sole-guest' });
    const lower = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingName: 'Conventional guest name',
    });
    const guest = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
      isGuest: true,
    });

    const result = await reconcileEnrollmentIdentities({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      ...actorFor(user),
    });

    expect(result.enrollment).toMatchObject({
      id: guest.id,
      is_guest: true,
      pending_name: 'Conventional guest name',
      pending_uid: user.uid,
      pending_uin: user.uin,
      user_id: null,
    });
    expect(result.mergedEnrollmentIds).toEqual([lower.id]);

    const classification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: user.id,
    });
    expect(classification.actionableConventionalInvitationCandidates).toHaveLength(1);
    expect(classification.actionableRosterInvitationCandidates).toHaveLength(0);

    const admitted = await admitUserFromEnrollmentInvitation({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      source: { type: 'pending_uid' },
      ...checkedAdmissionFor(user),
    });
    expect(admitted).toMatchObject({ id: guest.id, is_guest: true, status: 'joined' });
  });

  it('reconciles redundant pending candidates into one roster row beside bound-left', async () => {
    const user = await createUser({ prefix: 'left-roster' });
    const bound = await createEnrollment({
      courseInstance,
      userId: user.id,
      status: 'left',
      firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
    });
    const conventional = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingName: 'Conventional display name',
      pendingEmail: 'conventional@example.com',
    });
    const rosterInvitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const label = await queryRow(
      sql.insert_student_label,
      {
        course_instance_id: courseInstance.id,
        name: nextFixtureName('preserved-roster-label'),
        uuid: crypto.randomUUID(),
      },
      StudentLabelSchema,
    );
    await execute(sql.insert_student_label_enrollment, {
      enrollment_id: conventional.id,
      student_label_id: label.id,
    });
    const boundBefore = await selectEnrollments([bound.id]);

    const result = await reconcileEnrollmentIdentities({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      ...actorFor(user),
    });

    expect(result).toMatchObject({
      enrollment: { id: bound.id, status: 'left' },
      mergedEnrollmentIds: [conventional.id],
      preservedRosterInvitation: {
        id: rosterInvitation.id,
        pending_email: 'conventional@example.com',
        pending_name: 'Conventional display name',
        pending_uid: user.uid,
        pending_uin: user.uin,
        user_id: null,
      },
    });
    expect(await selectEnrollments([bound.id])).toEqual(boundBefore);
    expect(await selectEnrollments([bound.id, conventional.id, rosterInvitation.id])).toEqual([
      bound,
      result.preservedRosterInvitation,
    ]);
    expect(
      await selectIds(sql.select_student_label_ids, {
        enrollment_id: rosterInvitation.id,
      }),
    ).toEqual([label.id]);

    const admitted = await admitUserFromEnrollmentInvitation({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      source: { type: 'institution_uin' },
      ...checkedAdmissionFor(user),
    });
    expect(admitted).toMatchObject({ id: bound.id, status: 'joined', user_id: user.id });
    expect(await selectEnrollments([bound.id, rosterInvitation.id])).toHaveLength(1);
  });

  it('preserves blocked state in merge-only and aborts checked admission', async () => {
    const admissionUser = await createUser({ prefix: 'blocked-admission' });
    const blocked = await createEnrollment({
      courseInstance,
      userId: admissionUser.id,
      status: 'blocked',
      firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
    });
    const invitation = await createEnrollment({
      courseInstance,
      pendingUin: admissionUser.uin,
    });

    await expect(
      admitUserFromEnrollmentInvitation({
        courseInstanceId: courseInstance.id,
        userId: admissionUser.id,
        source: { type: 'institution_uin' },
        ...checkedAdmissionFor(admissionUser),
      }),
    ).rejects.toBeInstanceOf(EnrollmentAdmissionBlockedError);
    expect(await selectEnrollments([blocked.id, invitation.id])).toHaveLength(2);

    const mergeResult = await reconcileEnrollmentIdentities({
      courseInstanceId: courseInstance.id,
      userId: admissionUser.id,
      ...actorFor(admissionUser),
    });
    expect(mergeResult.enrollment).toMatchObject({ id: blocked.id, status: 'blocked' });
    expect(await selectEnrollments([blocked.id, invitation.id])).toHaveLength(1);

    await expect(
      admitUserFromEnrollmentInvitation({
        courseInstanceId: courseInstance.id,
        userId: admissionUser.id,
        source: { type: 'institution_uin' },
        ...checkedAdmissionFor(admissionUser),
      }),
    ).rejects.toBeInstanceOf(EnrollmentAdmissionBlockedError);
  });

  it('allows explicit acceptance of a conventional pending-UID guest invitation', async () => {
    const user = await createUser({ prefix: 'guest-conventional' });
    const invitation = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      isGuest: true,
    });

    const admitted = await admitUserFromEnrollmentInvitation({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      source: { type: 'pending_uid' },
      ...checkedAdmissionFor(user),
    });

    expect(admitted).toMatchObject({
      id: invitation.id,
      is_guest: true,
      status: 'joined',
      user_id: user.id,
    });
    expect(await selectReconciliationAuditEvents(invitation.id)).toEqual([
      expect.objectContaining({
        action: 'update',
        action_detail: 'invitation_accepted',
        context: expect.objectContaining({
          admission_source: 'pending_uid',
          reason: 'identity_reconciliation',
        }),
      }),
    ]);
  });

  it('atomically admits ordinary self-enrollment with no candidate', async () => {
    const user = await createUser({ prefix: 'ordinary-no-candidate' });
    let validationCalls = 0;

    const admitted = await admitUserToCourseInstance({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      source: { type: 'ordinary' },
      ...actorFor(user),
      validateAdmission: async (context) => {
        validationCalls += 1;
        expect(context).toEqual({
          enrollmentAction: 'insert',
          source: { type: 'ordinary' },
        });
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.source)).toBe(true);
        expect(() => {
          (context as { enrollmentAction: 'reconcile' }).enrollmentAction = 'reconcile';
        }).toThrow(TypeError);
        expect(
          (
            await selectEnrollmentIdentityClassification({
              courseInstanceId: courseInstance.id,
              userId: user.id,
            })
          ).candidates,
        ).toHaveLength(0);
      },
    });

    expect(validationCalls).toBe(1);
    expect(admitted).toMatchObject({
      is_guest: false,
      status: 'joined',
      user_id: user.id,
    });
    expect(admitted.first_joined_at).not.toBeNull();
    expect(
      (
        await selectAuditEventsByEnrollmentId({
          enrollment_id: admitted.id,
          table_names: ['enrollments'],
        })
      ).filter(
        (event) =>
          (event.context as Record<string, unknown> | null)?.reason === 'checked_admission',
      ),
    ).toEqual([
      expect.objectContaining({
        action: 'insert',
        action_detail: 'implicit_joined',
        enrollment_id: admitted.id,
        row_id: admitted.id,
      }),
    ]);
  });

  it('ordinary admission rejoins bound left and removed enrollments', async () => {
    for (const status of ['left', 'removed'] as const) {
      const user = await createUser({ prefix: `ordinary-rejoin-${status}` });
      const enrollment = await createEnrollment({
        courseInstance,
        userId: user.id,
        status,
        firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
      });

      const admitted = await admitUserToCourseInstance({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        source: { type: 'ordinary' },
        ...checkedAdmissionFor(user),
      });

      expect(admitted).toMatchObject({
        id: enrollment.id,
        status: 'joined',
        user_id: user.id,
      });
    }
  });

  it('runs mandatory validation from the locked decision before mutations and rolls it back', async () => {
    const user = await createUser({ prefix: 'validation-rollback' });
    const conventional = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
    });
    const rosterInvitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
      pendingName: 'Original roster name',
    });
    const label = await queryRow(
      sql.insert_student_label,
      {
        course_instance_id: courseInstance.id,
        name: nextFixtureName('validation-label'),
        uuid: crypto.randomUUID(),
      },
      StudentLabelSchema,
    );
    await execute(sql.insert_student_label_enrollment, {
      enrollment_id: conventional.id,
      student_label_id: label.id,
    });
    const enrollmentsBefore = await selectEnrollments([conventional.id, rosterInvitation.id]);

    await expect(
      admitUserToCourseInstance({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        source: { type: 'institution_uin' },
        ...actorFor(user),
        validateAdmission: async (context) => {
          expect(context).toEqual({
            enrollmentAction: 'reconcile',
            source: { type: 'institution_uin' },
          });
          expect(Object.keys(context).sort()).toEqual(['enrollmentAction', 'source']);
          await execute(sql.update_enrollment_pending_name, {
            enrollment_id: rosterInvitation.id,
            pending_name: 'Rolled-back validation name',
          });
          throw new Error('validation denied');
        },
      }),
    ).rejects.toThrow('validation denied');

    expect(await selectEnrollments([conventional.id, rosterInvitation.id])).toEqual(
      enrollmentsBefore,
    );
    expect(
      await selectIds(sql.select_student_label_ids, {
        enrollment_id: conventional.id,
      }),
    ).toEqual([label.id]);
    expect(await selectReconciliationAuditEvents(conventional.id)).toEqual([]);
    expect(await selectReconciliationAuditEvents(rosterInvitation.id)).toEqual([]);
  });

  it('admits from an exact LTI source in one update and clears every pending field', async () => {
    const user = await createUser({ prefix: 'lti-admission' });
    const lti13CourseInstance = await createLti13CourseInstance(courseInstance);
    const invitation = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingUin: user.uin,
      pendingName: 'Pending LTI name',
      pendingEmail: 'pending-lti@example.com',
      pendingLti13CourseInstanceId: lti13CourseInstance.id,
      pendingLti13Sub: 'admission-sub',
    });

    const admitted = await admitUserFromEnrollmentInvitation({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      source: {
        type: 'lti13',
        lti13CourseInstanceId: lti13CourseInstance.id,
        sub: 'admission-sub',
      },
      ...checkedAdmissionFor(user),
    });

    expect(admitted).toMatchObject({
      id: invitation.id,
      pending_email: null,
      pending_lti13_course_instance_id: null,
      pending_lti13_sub: null,
      pending_name: null,
      pending_uid: null,
      pending_uin: null,
      status: 'joined',
      user_id: user.id,
    });
    expect(admitted.first_joined_at).not.toBeNull();
    expect(await selectReconciliationAuditEvents(invitation.id)).toEqual([
      expect.objectContaining({
        action: 'update',
        action_detail: 'roster_admitted',
        context: expect.objectContaining({
          admission_source: 'lti13',
          reason: 'identity_reconciliation',
        }),
      }),
    ]);
  });

  it('returns an already-joined enrollment for a mismatched LTI source without validation or audit', async () => {
    const user = await createUser({ prefix: 'joined-lti-noop' });
    const joined = await createEnrollment({
      courseInstance,
      userId: user.id,
      status: 'joined',
      firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
    });
    const lti13CourseInstance = await createLti13CourseInstance(courseInstance);
    const before = await selectEnrollments([joined.id]);

    expect(
      await selectEnrollmentAdmissionDecision(
        {
          courseInstanceId: courseInstance.id,
          userId: user.id,
          lti13Identity: {
            lti13CourseInstanceId: lti13CourseInstance.id,
            sub: 'no-matching-invitation',
          },
        },
        {
          type: 'lti13',
          lti13CourseInstanceId: lti13CourseInstance.id,
          sub: 'no-matching-invitation',
        },
      ),
    ).toMatchObject({ allowed: false, reason: 'already_joined' });

    const admitted = await admitUserToCourseInstance({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      source: {
        type: 'lti13',
        lti13CourseInstanceId: lti13CourseInstance.id,
        sub: 'no-matching-invitation',
      },
      ...actorFor(user),
      validateAdmission: async () => {
        throw new Error('Validation must not run for an already-joined enrollment');
      },
    });

    expect(admitted).toEqual(joined);
    expect(await selectEnrollments([joined.id])).toEqual(before);
    expect(await selectReconciliationAuditEvents(joined.id)).toEqual([]);
  });

  it('uses a bound survivor, earliest join time, all dependent merge rules, and complete auditing', async () => {
    const user = await createUser({ prefix: 'dependent-merge' });
    const earliestJoinedAt = new Date('2021-01-01T00:00:00Z');
    const pendingUidLoser = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      firstJoinedAt: earliestJoinedAt,
    });
    const survivor = await createEnrollment({
      courseInstance,
      userId: user.id,
      status: 'joined',
      firstJoinedAt: new Date('2022-01-01T00:00:00Z'),
    });
    const pendingUinLoser = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
      isGuest: true,
    });

    const labelOne = await queryRow(
      sql.insert_student_label,
      {
        course_instance_id: courseInstance.id,
        name: nextFixtureName('merge-label-one'),
        uuid: crypto.randomUUID(),
      },
      StudentLabelSchema,
    );
    const labelTwo = await queryRow(
      sql.insert_student_label,
      {
        course_instance_id: courseInstance.id,
        name: nextFixtureName('merge-label-two'),
        uuid: crypto.randomUUID(),
      },
      StudentLabelSchema,
    );
    for (const [enrollmentId, studentLabelId] of [
      [pendingUidLoser.id, labelOne.id],
      [survivor.id, labelOne.id],
      [pendingUinLoser.id, labelTwo.id],
    ]) {
      await execute(sql.insert_student_label_enrollment, {
        enrollment_id: enrollmentId,
        student_label_id: studentLabelId,
      });
    }
    const keptLabelOneMembership = await queryRow(
      sql.select_student_label_enrollment_id,
      {
        enrollment_id: survivor.id,
        student_label_id: labelOne.id,
      },
      z.object({ id: IdSchema }),
    );
    const movedLabelTwoMembership = await queryRow(
      sql.select_student_label_enrollment_id,
      {
        enrollment_id: pendingUinLoser.id,
        student_label_id: labelTwo.id,
      },
      z.object({ id: IdSchema }),
    );

    const extensionOld = await queryRow(
      sql.insert_publishing_extension,
      {
        course_instance_id: courseInstance.id,
        end_date: new Date('2024-01-01T00:00:00Z'),
        name: nextFixtureName('extension-old'),
      },
      CourseInstancePublishingExtensionSchema,
    );
    const extensionTieLower = await queryRow(
      sql.insert_publishing_extension,
      {
        course_instance_id: courseInstance.id,
        end_date: new Date('2025-01-01T00:00:00Z'),
        name: nextFixtureName('extension-tie-lower'),
      },
      CourseInstancePublishingExtensionSchema,
    );
    const extensionTieHigher = await queryRow(
      sql.insert_publishing_extension,
      {
        course_instance_id: courseInstance.id,
        end_date: new Date('2025-01-01T00:00:00Z'),
        name: nextFixtureName('extension-tie-higher'),
      },
      CourseInstancePublishingExtensionSchema,
    );
    for (const [enrollmentId, publishingExtensionId] of [
      [survivor.id, extensionOld.id],
      [pendingUidLoser.id, extensionTieLower.id],
      [pendingUinLoser.id, extensionTieHigher.id],
    ]) {
      await execute(sql.insert_publishing_extension_enrollment, {
        enrollment_id: enrollmentId,
        publishing_extension_id: publishingExtensionId,
      });
    }
    const movedPublishingMembership = await queryRow(
      sql.select_publishing_extension_enrollment_id,
      {
        enrollment_id: pendingUinLoser.id,
        publishing_extension_id: extensionTieHigher.id,
      },
      z.object({ id: IdSchema }),
    );

    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw19-accessControlUi',
    });
    const ruleOne = await queryRow(
      sql.insert_assessment_access_control_rule,
      {
        assessment_id: assessment.id,
        number: 90_000 + nextFixtureNumber(),
        uuid: crypto.randomUUID(),
      },
      AssessmentAccessControlRuleSchema,
    );
    const ruleTwo = await queryRow(
      sql.insert_assessment_access_control_rule,
      {
        assessment_id: assessment.id,
        number: 90_000 + nextFixtureNumber(),
        uuid: crypto.randomUUID(),
      },
      AssessmentAccessControlRuleSchema,
    );
    for (const [enrollmentId, ruleId] of [
      [pendingUidLoser.id, ruleOne.id],
      [survivor.id, ruleOne.id],
      [pendingUinLoser.id, ruleTwo.id],
    ]) {
      await execute(sql.insert_assessment_access_control_enrollment, {
        enrollment_id: enrollmentId,
        rule_id: ruleId,
      });
    }
    const keptRuleOneReference = await queryRow(
      sql.select_assessment_access_control_enrollment_id,
      {
        enrollment_id: survivor.id,
        rule_id: ruleOne.id,
      },
      z.object({ id: IdSchema }),
    );
    const movedRuleTwoReference = await queryRow(
      sql.select_assessment_access_control_enrollment_id,
      {
        enrollment_id: pendingUinLoser.id,
        rule_id: ruleTwo.id,
      },
      z.object({ id: IdSchema }),
    );

    const historicalLoserAuditEvent = await insertAuditEvent({
      tableName: 'enrollments',
      action: 'insert',
      actionDetail: 'invited',
      rowId: pendingUidLoser.id,
      newRow: pendingUidLoser,
      subjectUserId: null,
      agentUserId: user.id,
      agentAuthnUserId: user.id,
    });

    const result = await reconcileEnrollmentIdentities({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      ...actorFor(user),
    });

    expect(result.enrollment).toMatchObject({
      id: survivor.id,
      is_guest: true,
      status: 'joined',
      user_id: user.id,
    });
    expect(result.enrollment?.first_joined_at?.getTime()).toBe(earliestJoinedAt.getTime());
    expect(result.mergedEnrollmentIds).toEqual([pendingUidLoser.id, pendingUinLoser.id]);
    expect(await selectEnrollments([pendingUidLoser.id, survivor.id, pendingUinLoser.id])).toEqual([
      result.enrollment,
    ]);

    expect(await selectIds(sql.select_student_label_ids, { enrollment_id: survivor.id })).toEqual([
      labelOne.id,
      labelTwo.id,
    ]);
    expect(
      await queryRow(
        sql.select_student_label_enrollment_id,
        {
          enrollment_id: survivor.id,
          student_label_id: labelOne.id,
        },
        z.object({ id: IdSchema }),
      ),
    ).toEqual(keptLabelOneMembership);
    expect(
      await queryRow(
        sql.select_student_label_enrollment_id,
        {
          enrollment_id: survivor.id,
          student_label_id: labelTwo.id,
        },
        z.object({ id: IdSchema }),
      ),
    ).toEqual(movedLabelTwoMembership);
    expect(
      await selectIds(sql.select_publishing_extension_ids, {
        enrollment_id: survivor.id,
      }),
    ).toEqual([extensionTieHigher.id]);
    expect(
      await queryRow(
        sql.select_publishing_extension_enrollment_id,
        {
          enrollment_id: survivor.id,
          publishing_extension_id: extensionTieHigher.id,
        },
        z.object({ id: IdSchema }),
      ),
    ).toEqual(movedPublishingMembership);
    expect(
      await selectIds(sql.select_assessment_access_control_rule_ids, {
        enrollment_id: survivor.id,
      }),
    ).toEqual([ruleOne.id, ruleTwo.id]);
    expect(
      await queryRow(
        sql.select_assessment_access_control_enrollment_id,
        {
          enrollment_id: survivor.id,
          rule_id: ruleOne.id,
        },
        z.object({ id: IdSchema }),
      ),
    ).toEqual(keptRuleOneReference);
    expect(
      await queryRow(
        sql.select_assessment_access_control_enrollment_id,
        {
          enrollment_id: survivor.id,
          rule_id: ruleTwo.id,
        },
        z.object({ id: IdSchema }),
      ),
    ).toEqual(movedRuleTwoReference);

    const auditEvents = await selectReconciliationAuditEvents(survivor.id);
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'update',
          action_detail: 'identity_reconciled',
          context: expect.objectContaining({ reason: 'identity_reconciliation' }),
          enrollment_id: survivor.id,
          row_id: survivor.id,
        }),
        expect.objectContaining({
          action: 'delete',
          action_detail: 'identity_merged',
          context: expect.objectContaining({ reason: 'identity_reconciliation' }),
          enrollment_id: survivor.id,
          row_id: pendingUidLoser.id,
        }),
        expect.objectContaining({
          action: 'delete',
          action_detail: 'identity_merged',
          context: expect.objectContaining({ reason: 'identity_reconciliation' }),
          enrollment_id: survivor.id,
          row_id: pendingUinLoser.id,
        }),
      ]),
    );
    expect(
      await queryRow(
        sql.select_audit_event_by_id,
        { audit_event_id: historicalLoserAuditEvent.id },
        z.object({ enrollment_id: IdSchema.nullable() }),
      ),
    ).toEqual({ enrollment_id: null });
  });
});
