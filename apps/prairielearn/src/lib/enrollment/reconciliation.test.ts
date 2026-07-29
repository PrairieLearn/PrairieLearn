import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';


import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectAuditEventsByEnrollmentId } from '../../models/audit-event.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import * as helperCourse from '../../tests/helperCourse.js';
import * as helperDb from '../../tests/helperDb.js';
import {
  AssessmentAccessControlRuleSchema,
  type CourseInstance,
  CourseInstancePublishingExtensionSchema,
  StudentLabelSchema,
  type User,
} from '../db-types.js';
import { TEST_COURSE_PATH } from '../paths.js';

import { type EnrollmentIdentityClassification } from './identity.js';
import { EnrollmentAdmissionDeniedError, admitUserToCourseInstance } from './reconciliation.js';
import {
  actorFor,
  createEnrollment,
  createLti13CourseInstance,
  createUser,
  nextFixtureName,
  nextFixtureNumber,
  selectEnrollments,
  selectReconciliationAuditEvents,
} from './reconciliation.test-helpers.js';

const sql = loadSqlEquiv(import.meta.url);

async function selectIds(query: string, params: Record<string, unknown>): Promise<string[]> {
  return (await queryRows(query, params, z.object({ id: IdSchema }))).map((row) => row.id);
}

describe('checked enrollment admission', { concurrent: false }, () => {
  let courseInstance: CourseInstance;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
  });

  afterAll(helperDb.after);

  async function admit(
    user: User,
    input: Pick<
      Parameters<typeof admitUserToCourseInstance>[0],
      'expectedInvitationEnrollmentId' | 'selectSource' | 'source' | 'validateAdmission'
    >,
  ) {
    return await admitUserToCourseInstance({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      ...actorFor(user),
      ...input,
    });
  }

  it('table-drives bound, sole-guest, and lowest-ID survivor choice', async () => {
    const earliest = new Date('2021-01-01T00:00:00Z');
    const cases = [
      {
        name: 'bound',
        source: { type: 'ordinary' as const },
        setup: async (user: User) => {
          const loser = await createEnrollment({
            courseInstance,
            pendingUid: user.uid,
            firstJoinedAt: earliest,
            isGuest: true,
          });
          const survivor = await createEnrollment({
            courseInstance,
            userId: user.id,
            status: 'left',
            firstJoinedAt: new Date('2022-01-01T00:00:00Z'),
          });
          return {
            actionDetail: 'implicit_joined',
            expectedId: survivor.id,
            ids: [loser.id, survivor.id],
            isGuest: true,
          };
        },
      },
      {
        name: 'sole-guest',
        source: { type: 'pending_uid' as const },
        setup: async (user: User) => {
          const lower = await createEnrollment({
            courseInstance,
            pendingUid: user.uid,
            firstJoinedAt: earliest,
          });
          const guest = await createEnrollment({
            courseInstance,
            pendingUin: user.uin,
            isGuest: true,
          });
          return {
            actionDetail: 'invitation_accepted',
            expectedId: guest.id,
            ids: [lower.id, guest.id],
            isGuest: true,
          };
        },
      },
      {
        name: 'lowest-id',
        source: { type: 'pending_uid' as const },
        setup: async (user: User) => {
          const lower = await createEnrollment({ courseInstance, pendingUid: user.uid });
          const higher = await createEnrollment({
            courseInstance,
            pendingUin: user.uin,
            firstJoinedAt: earliest,
          });
          return {
            actionDetail: 'invitation_accepted',
            expectedId: lower.id,
            ids: [lower.id, higher.id],
            isGuest: false,
          };
        },
      },
      {
        name: 'multiple-guests',
        source: { type: 'pending_uid' as const },
        setup: async (user: User) => {
          const lower = await createEnrollment({
            courseInstance,
            pendingUid: user.uid,
            firstJoinedAt: earliest,
            isGuest: true,
          });
          const higher = await createEnrollment({
            courseInstance,
            pendingUin: user.uin,
            isGuest: true,
          });
          return {
            actionDetail: 'invitation_accepted',
            expectedId: lower.id,
            ids: [lower.id, higher.id],
            isGuest: true,
          };
        },
      },
    ];

    for (const testCase of cases) {
      const user = await createUser({ prefix: `survivor-${testCase.name}` });
      const expected = await testCase.setup(user);
      const admitted = await admit(user, {
        source: testCase.source,
        validateAdmission: async () => {},
      });

      expect(admitted).toMatchObject({
        id: expected.expectedId,
        is_guest: expected.isGuest,
        status: 'joined',
        user_id: user.id,
      });
      expect(admitted.first_joined_at?.getTime()).toBe(earliest.getTime());
      expect(await selectEnrollments(expected.ids)).toEqual([admitted]);
      expect(await selectReconciliationAuditEvents(admitted.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'update',
            action_detail: expected.actionDetail,
            row_id: admitted.id,
          }),
        ]),
      );
    }
  });

  it('inserts an ordinary checked admission', async () => {
    const insertedUser = await createUser({ prefix: 'ordinary-insert' });
    let insertValidationCalls = 0;
    const inserted = await admit(insertedUser, {
      source: { type: 'ordinary' },
      validateAdmission: async ({ source }) => {
        insertValidationCalls += 1;
        expect(source).toEqual({ type: 'ordinary' });
      },
    });
    expect(insertValidationCalls).toBe(1);
    expect(inserted).toMatchObject({ status: 'joined', user_id: insertedUser.id });
    expect(
      await selectAuditEventsByEnrollmentId({
        enrollment_id: inserted.id,
        table_names: ['enrollments'],
      }),
    ).toEqual([
      expect.objectContaining({
        action: 'insert',
        action_detail: 'implicit_joined',
        row_id: inserted.id,
      }),
    ]);
  });

  it('uses locked policy selection and pins invitation authority to an enrollment', async () => {
    const user = await createUser({ prefix: 'source-policy' });
    const invitation = await createEnrollment({ courseInstance, pendingUin: user.uin });
    let validatedSource: string | undefined;
    const selectSource = (classification: EnrollmentIdentityClassification) =>
      classification.actionableInstitutionRosterInvitation === null
        ? ({ type: 'ordinary' } as const)
        : ({ type: 'institution_uin' } as const);

    await expect(
      admit(user, {
        source: { type: 'ordinary' },
        expectedInvitationEnrollmentId: `${BigInt(invitation.id) + 1n}`,
        selectSource,
        validateAdmission: async ({ source }) => {
          validatedSource = source.type;
        },
      }),
    ).rejects.toMatchObject({
      decision: { reason: 'no_matching_invitation', source: { type: 'institution_uin' } },
    });
    expect(validatedSource).toBeUndefined();

    const admitted = await admit(user, {
      source: { type: 'ordinary' },
      expectedInvitationEnrollmentId: invitation.id,
      selectSource,
      validateAdmission: async ({ source }) => {
        validatedSource = source.type;
      },
    });
    expect(validatedSource).toBe('institution_uin');
    expect(admitted.id).toBe(invitation.id);
  });

  it('requires exact LTI authority and clears every pending field in the admitting update', async () => {
    const user = await createUser({ prefix: 'lti-admission' });
    const link = await createLti13CourseInstance(courseInstance);
    const invitation = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingUin: user.uin,
      pendingName: 'Pending LTI name',
      pendingEmail: 'pending-lti@example.com',
      pendingLti13CourseInstanceId: link.id,
      pendingLti13Sub: 'exact-sub',
    });

    await expect(
      admit(user, {
        source: { type: 'pending_uid' },
        validateAdmission: async () => {},
      }),
    ).rejects.toBeInstanceOf(EnrollmentAdmissionDeniedError);
    expect(await selectEnrollments([invitation.id])).toEqual([invitation]);

    const admitted = await admit(user, {
      source: {
        type: 'lti13',
        lti13CourseInstanceId: link.id,
        sub: 'exact-sub',
      },
      expectedInvitationEnrollmentId: invitation.id,
      validateAdmission: async () => {},
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
  });

  it('uses the bound survivor, union/max/union dependent rules, earliest join, and complete audits', async () => {
    const user = await createUser({ prefix: 'dependent-merge' });
    const earliest = new Date('2021-01-01T00:00:00Z');
    const pendingUid = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      firstJoinedAt: earliest,
    });
    const survivor = await createEnrollment({
      courseInstance,
      userId: user.id,
      status: 'left',
      firstJoinedAt: new Date('2022-01-01T00:00:00Z'),
    });
    const pendingUin = await createEnrollment({ courseInstance, pendingUin: user.uin });

    const labelOne = await queryRow(
      sql.insert_student_label,
      {
        course_instance_id: courseInstance.id,
        name: nextFixtureName('label-one'),
        uuid: crypto.randomUUID(),
      },
      StudentLabelSchema,
    );
    const labelTwo = await queryRow(
      sql.insert_student_label,
      {
        course_instance_id: courseInstance.id,
        name: nextFixtureName('label-two'),
        uuid: crypto.randomUUID(),
      },
      StudentLabelSchema,
    );
    for (const [enrollmentId, studentLabelId] of [
      [pendingUid.id, labelOne.id],
      [survivor.id, labelOne.id],
      [pendingUin.id, labelTwo.id],
    ]) {
      await execute(sql.insert_student_label_enrollment, {
        enrollment_id: enrollmentId,
        student_label_id: studentLabelId,
      });
    }

    const olderExtension = await queryRow(
      sql.insert_publishing_extension,
      {
        course_instance_id: courseInstance.id,
        end_date: new Date('2024-01-01T00:00:00Z'),
        name: nextFixtureName('extension-old'),
      },
      CourseInstancePublishingExtensionSchema,
    );
    const newerExtension = await queryRow(
      sql.insert_publishing_extension,
      {
        course_instance_id: courseInstance.id,
        end_date: new Date('2025-01-01T00:00:00Z'),
        name: nextFixtureName('extension-new'),
      },
      CourseInstancePublishingExtensionSchema,
    );
    for (const [enrollmentId, publishingExtensionId] of [
      [survivor.id, olderExtension.id],
      [pendingUin.id, newerExtension.id],
    ]) {
      await execute(sql.insert_publishing_extension_enrollment, {
        enrollment_id: enrollmentId,
        publishing_extension_id: publishingExtensionId,
      });
    }

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
      [pendingUid.id, ruleOne.id],
      [survivor.id, ruleOne.id],
      [pendingUin.id, ruleTwo.id],
    ]) {
      await execute(sql.insert_assessment_access_control_enrollment, {
        enrollment_id: enrollmentId,
        rule_id: ruleId,
      });
    }

    const admitted = await admit(user, {
      source: { type: 'institution_uin' },
      validateAdmission: async () => {},
    });
    expect(admitted).toMatchObject({
      id: survivor.id,
      is_guest: false,
      status: 'joined',
      user_id: user.id,
    });
    expect(admitted.first_joined_at?.getTime()).toBe(earliest.getTime());
    expect(await selectEnrollments([pendingUid.id, survivor.id, pendingUin.id])).toEqual([
      admitted,
    ]);
    expect(await selectIds(sql.select_student_label_ids, { enrollment_id: survivor.id })).toEqual([
      labelOne.id,
      labelTwo.id,
    ]);
    expect(
      await selectIds(sql.select_publishing_extension_ids, {
        enrollment_id: survivor.id,
      }),
    ).toEqual([newerExtension.id]);
    expect(
      await selectIds(sql.select_assessment_access_control_rule_ids, {
        enrollment_id: survivor.id,
      }),
    ).toEqual([ruleOne.id, ruleTwo.id]);

    const auditEvents = await selectReconciliationAuditEvents(survivor.id);
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'update',
          action_detail: 'roster_admitted',
          row_id: survivor.id,
        }),
        expect.objectContaining({
          action: 'delete',
          action_detail: 'identity_merged',
          row_id: pendingUid.id,
        }),
        expect.objectContaining({
          action: 'delete',
          action_detail: 'identity_merged',
          row_id: pendingUin.id,
        }),
      ]),
    );
  });
});
