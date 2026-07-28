import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalScalar,
  queryRow,
  queryRows,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  AssessmentAccessControlRuleSchema,
  type CourseInstance,
  CourseInstancePublishingExtensionSchema,
  type Enrollment,
  EnrollmentSchema,
  type EnumEnrollmentStatus,
  Lti13CourseInstanceSchema,
  StudentLabelSchema,
  type User,
} from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { createInstitution, getOrCreateUser } from '../tests/utils/auth.js';

import { selectAssessmentByTid } from './assessment.js';
import { insertAuditEvent } from './audit-event.js';
import { selectCourseInstanceById } from './course-instances.js';
import {
  EnrollmentAdmissionBlockedError,
  EnrollmentInvitationRequiredError,
  admitUserFromEnrollmentInvitation,
  classifyEnrollmentIdentityCandidates,
  reconcileEnrollmentIdentities,
  selectEnrollmentIdentityCandidates,
} from './enrollment-reconciliation.js';

const sql = loadSqlEquiv(import.meta.url);

const OTHER_INSTITUTION_ID = '900001';
let fixtureCounter = 0;

const EnrollmentReconciliationAuditEventSchema = z.object({
  action: z.enum(['update', 'delete']),
  action_detail: z.string(),
  context: z.record(z.string(), z.unknown()),
  enrollment_id: IdSchema.nullable(),
  new_row: z.record(z.string(), z.unknown()).nullable(),
  old_row: z.record(z.string(), z.unknown()).nullable(),
  row_id: IdSchema,
});

function nextFixtureName(prefix: string): string {
  fixtureCounter += 1;
  return `${prefix}-${fixtureCounter}-${crypto.randomUUID()}`;
}

async function createUser({
  prefix,
  uin = nextFixtureName(`${prefix}-uin`),
  institutionId,
}: {
  institutionId?: string;
  prefix: string;
  uin?: string;
}): Promise<User> {
  const uid = `${nextFixtureName(prefix)}@${
    institutionId === OTHER_INSTITUTION_ID ? 'other.example' : 'example.com'
  }`;
  return await getOrCreateUser({
    uid,
    name: prefix,
    uin,
    email: uid,
    institutionId,
  });
}

async function createEnrollment({
  courseInstance,
  userId = null,
  status = 'invited',
  firstJoinedAt = null,
  isGuest = false,
  pendingUid = null,
  pendingUin = null,
  pendingName = null,
  pendingEmail = null,
  pendingLti13CourseInstanceId = null,
  pendingLti13Sub = null,
}: {
  courseInstance: CourseInstance;
  firstJoinedAt?: Date | null;
  isGuest?: boolean;
  pendingEmail?: string | null;
  pendingLti13CourseInstanceId?: string | null;
  pendingLti13Sub?: string | null;
  pendingName?: string | null;
  pendingUid?: string | null;
  pendingUin?: string | null;
  status?: EnumEnrollmentStatus;
  userId?: string | null;
}): Promise<Enrollment> {
  return await queryRow(
    sql.insert_enrollment,
    {
      course_instance_id: courseInstance.id,
      first_joined_at: firstJoinedAt,
      is_guest: isGuest,
      pending_email: pendingEmail,
      pending_lti13_course_instance_id: pendingLti13CourseInstanceId,
      pending_lti13_sub: pendingLti13Sub,
      pending_name: pendingName,
      pending_uid: pendingUid,
      pending_uin: pendingUin,
      status,
      user_id: userId,
    },
    EnrollmentSchema,
  );
}

async function selectEnrollments(enrollmentIds: string[]): Promise<Enrollment[]> {
  return await queryRows(
    sql.select_enrollments_by_ids,
    { enrollment_ids: enrollmentIds },
    EnrollmentSchema,
  );
}

async function createLti13CourseInstance(courseInstance: CourseInstance): Promise<{ id: string }> {
  const identity = nextFixtureName('lti-link');
  return await queryRow(
    sql.insert_lti13_course_instance,
    {
      context_id: `${identity}-context`,
      course_instance_id: courseInstance.id,
      deployment_id: `${identity}-deployment`,
    },
    Lti13CourseInstanceSchema.pick({ id: true }),
  );
}

async function selectIds(query: string, params: Record<string, unknown>): Promise<string[]> {
  return (await queryRows(query, params, z.object({ id: IdSchema }))).map((row) => row.id);
}

async function selectReconciliationAuditEvents(enrollmentIds: string[]) {
  return await queryRows(
    sql.select_enrollment_reconciliation_audit_events,
    { enrollment_ids: enrollmentIds },
    EnrollmentReconciliationAuditEventSchema,
  );
}

function actorFor(user: User) {
  return {
    agentAuthnUserId: user.id,
    agentUserId: user.id,
  };
}

function deferred() {
  let resolve: () => void;
  let reject: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject: reject!, resolve: resolve! };
}

async function waitForReconciliationLock(applicationName: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = await queryOptionalScalar(
      sql.select_waiting_reconciliation_lock,
      { application_name: applicationName },
      z.number(),
    );
    if (waiting !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for enrollment reconciliation lock');
}

describe('enrollment identity reconciliation', { concurrent: false }, () => {
  let courseInstance: CourseInstance;
  let otherCourseInstance: CourseInstance;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
    otherCourseInstance = await selectCourseInstanceById('2');
    await createInstitution(OTHER_INSTITUTION_ID, 'other.example', 'Other institution');
  });

  afterAll(helperDb.after);

  describe('candidate selection and classification', () => {
    it('is read-only, deduplicates overlapping keys, and preserves match provenance', async () => {
      const user = await createUser({ prefix: 'overlap' });
      const lti13CourseInstance = await createLti13CourseInstance(courseInstance);
      const enrollment = await createEnrollment({
        courseInstance,
        pendingUid: user.uid,
        pendingUin: user.uin,
        pendingLti13CourseInstanceId: lti13CourseInstance.id,
        pendingLti13Sub: 'overlap-sub',
        pendingName: 'Pending name',
        pendingEmail: 'pending@example.com',
      });
      const before = await selectEnrollments([enrollment.id]);

      const candidates = await selectEnrollmentIdentityCandidates({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        lti13Identity: {
          lti13CourseInstanceId: lti13CourseInstance.id,
          sub: 'overlap-sub',
        },
      });

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        enrollment: { id: enrollment.id },
        matches: {
          boundUser: false,
          institutionUin: true,
          lti13: true,
          pendingUid: true,
        },
      });
      expect(await selectEnrollments([enrollment.id])).toEqual(before);

      const classification = classifyEnrollmentIdentityCandidates(candidates);
      expect(classification.kind).toBe('actionable_roster_invitation');
      expect(classification.conventionalInvitationCandidates).toHaveLength(1);
      expect(classification.institutionRosterInvitationCandidates).toHaveLength(1);
      expect(classification.lti13RosterInvitationCandidates).toHaveLength(1);
    });

    it('keeps conventional pending-UID invitations distinct from roster authorization', async () => {
      const user = await createUser({ prefix: 'conventional' });
      await createEnrollment({
        courseInstance,
        pendingUid: user.uid,
        pendingUin: nextFixtureName('unrelated-uin'),
      });

      const classification = classifyEnrollmentIdentityCandidates(
        await selectEnrollmentIdentityCandidates({
          courseInstanceId: courseInstance.id,
          userId: user.id,
        }),
      );

      expect(classification.kind).toBe('actionable_conventional_invitation');
      expect(classification.conventionalInvitationCandidates).toHaveLength(1);
      expect(classification.rosterInvitationCandidates).toHaveLength(0);
    });

    it('scopes pending UIN matches to the course institution', async () => {
      const sharedUin = nextFixtureName('institution-uin');
      const sameInstitutionUser = await createUser({
        prefix: 'same-institution',
        uin: sharedUin,
      });
      const otherInstitutionUser = await createUser({
        prefix: 'other-institution',
        uin: sharedUin,
        institutionId: OTHER_INSTITUTION_ID,
      });
      const enrollment = await createEnrollment({
        courseInstance,
        pendingUin: sharedUin,
      });

      const sameInstitutionCandidates = await selectEnrollmentIdentityCandidates({
        courseInstanceId: courseInstance.id,
        userId: sameInstitutionUser.id,
      });
      expect(sameInstitutionCandidates).toHaveLength(1);
      expect(sameInstitutionCandidates[0]).toMatchObject({
        enrollment: { id: enrollment.id },
        matches: { institutionUin: true },
      });

      expect(
        await selectEnrollmentIdentityCandidates({
          courseInstanceId: courseInstance.id,
          userId: otherInstitutionUser.id,
        }),
      ).toHaveLength(0);
    });

    it('requires exact LTI link ownership and source provenance', async () => {
      const user = await createUser({ prefix: 'lti-source' });
      const expectedLink = await createLti13CourseInstance(courseInstance);
      const otherLink = await createLti13CourseInstance(courseInstance);
      const foreignLink = await createLti13CourseInstance(otherCourseInstance);
      const enrollment = await createEnrollment({
        courseInstance,
        pendingUid: user.uid,
        pendingUin: user.uin,
        pendingLti13CourseInstanceId: expectedLink.id,
        pendingLti13Sub: 'expected-sub',
      });

      for (const source of [
        {
          lti13CourseInstanceId: expectedLink.id,
          sub: 'wrong-sub',
        },
        {
          lti13CourseInstanceId: otherLink.id,
          sub: 'expected-sub',
        },
      ]) {
        const candidates = await selectEnrollmentIdentityCandidates({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          lti13Identity: source,
        });
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
          enrollment: { id: enrollment.id },
          matches: { institutionUin: true, lti13: false, pendingUid: true },
        });
        expect(
          classifyEnrollmentIdentityCandidates(candidates).lti13RosterInvitationCandidates,
        ).toHaveLength(0);
        await expect(
          admitUserFromEnrollmentInvitation({
            courseInstanceId: courseInstance.id,
            userId: user.id,
            source: { type: 'lti13', ...source },
            ...actorFor(user),
          }),
        ).rejects.toBeInstanceOf(EnrollmentInvitationRequiredError);
      }

      const foreignEnrollment = await createEnrollment({
        courseInstance,
        pendingUin: nextFixtureName('foreign-link-uin'),
        pendingLti13CourseInstanceId: foreignLink.id,
        pendingLti13Sub: 'foreign-sub',
      });
      expect(
        await selectEnrollmentIdentityCandidates({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          lti13Identity: {
            lti13CourseInstanceId: foreignLink.id,
            sub: 'foreign-sub',
          },
        }),
      ).not.toContainEqual(
        expect.objectContaining({
          enrollment: expect.objectContaining({ id: foreignEnrollment.id }),
        }),
      );

      const exactCandidates = await selectEnrollmentIdentityCandidates({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        lti13Identity: {
          lti13CourseInstanceId: expectedLink.id,
          sub: 'expected-sub',
        },
      });
      expect(exactCandidates[0].matches.lti13).toBe(true);
    });

    it('does not treat bound left, removed, blocked, or guest rows as roster authorization', async () => {
      for (const status of ['left', 'removed', 'blocked'] as const) {
        const user = await createUser({ prefix: `ordinary-${status}` });
        await createEnrollment({
          courseInstance,
          userId: user.id,
          status,
          firstJoinedAt: new Date('2025-01-01T00:00:00Z'),
        });
        const classification = classifyEnrollmentIdentityCandidates(
          await selectEnrollmentIdentityCandidates({
            courseInstanceId: courseInstance.id,
            userId: user.id,
          }),
        );
        expect(classification.rosterInvitationCandidates).toHaveLength(0);
        expect(classification.kind).toBe(status === 'blocked' ? 'blocked' : 'ordinary');
      }

      const guestUser = await createUser({ prefix: 'guest-roster' });
      await createEnrollment({
        courseInstance,
        pendingUin: guestUser.uin,
        isGuest: true,
      });
      const guestClassification = classifyEnrollmentIdentityCandidates(
        await selectEnrollmentIdentityCandidates({
          courseInstanceId: courseInstance.id,
          userId: guestUser.id,
        }),
      );
      expect(guestClassification.rosterInvitationCandidates).toHaveLength(0);
      expect(guestClassification.kind).toBe('ordinary');
    });

    it('vetoes roster actionability for bound joined, bound removed, bound guest, and any guest candidate', async () => {
      for (const boundState of [
        { isGuest: false, status: 'joined' as const },
        { isGuest: false, status: 'removed' as const },
        { isGuest: true, status: 'left' as const },
      ]) {
        const user = await createUser({
          prefix: `roster-veto-${boundState.status}-${boundState.isGuest}`,
        });
        const bound = await createEnrollment({
          courseInstance,
          userId: user.id,
          status: boundState.status,
          isGuest: boundState.isGuest,
          firstJoinedAt: new Date('2025-01-01T00:00:00Z'),
        });
        const invitation = await createEnrollment({
          courseInstance,
          pendingUin: user.uin,
        });
        const classification = classifyEnrollmentIdentityCandidates(
          await selectEnrollmentIdentityCandidates({
            courseInstanceId: courseInstance.id,
            userId: user.id,
          }),
        );

        expect(classification.institutionRosterInvitationCandidates).toHaveLength(1);
        expect(classification.actionableInstitutionRosterInvitationCandidates).toHaveLength(0);
        await expect(
          admitUserFromEnrollmentInvitation({
            courseInstanceId: courseInstance.id,
            userId: user.id,
            source: { type: 'institution_uin' },
            ...actorFor(user),
          }),
        ).rejects.toBeInstanceOf(EnrollmentInvitationRequiredError);
        expect(await selectEnrollments([bound.id, invitation.id])).toHaveLength(2);
      }

      const user = await createUser({ prefix: 'roster-veto-separate-guest' });
      const rosterInvitation = await createEnrollment({
        courseInstance,
        pendingUin: user.uin,
      });
      const guestCandidate = await createEnrollment({
        courseInstance,
        pendingUid: user.uid,
        isGuest: true,
      });
      const classification = classifyEnrollmentIdentityCandidates(
        await selectEnrollmentIdentityCandidates({
          courseInstanceId: courseInstance.id,
          userId: user.id,
        }),
      );

      expect(classification.institutionRosterInvitationCandidates).toHaveLength(1);
      expect(classification.actionableInstitutionRosterInvitationCandidates).toHaveLength(0);
      await expect(
        admitUserFromEnrollmentInvitation({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          source: { type: 'institution_uin' },
          ...actorFor(user),
        }),
      ).rejects.toBeInstanceOf(EnrollmentInvitationRequiredError);
      expect(await selectEnrollments([rosterInvitation.id, guestCandidate.id])).toHaveLength(2);
    });

    it('does not make a bound left or removed enrollment conventionally actionable', async () => {
      for (const status of ['left', 'removed'] as const) {
        const user = await createUser({ prefix: `conventional-bound-${status}` });
        const bound = await createEnrollment({
          courseInstance,
          userId: user.id,
          status,
          firstJoinedAt: new Date('2025-01-01T00:00:00Z'),
        });
        const invitation = await createEnrollment({
          courseInstance,
          pendingUid: user.uid,
        });
        const classification = classifyEnrollmentIdentityCandidates(
          await selectEnrollmentIdentityCandidates({
            courseInstanceId: courseInstance.id,
            userId: user.id,
          }),
        );

        expect(classification.conventionalInvitationCandidates).toHaveLength(1);
        expect(classification.actionableConventionalInvitationCandidates).toHaveLength(0);
        await expect(
          admitUserFromEnrollmentInvitation({
            courseInstanceId: courseInstance.id,
            userId: user.id,
            source: { type: 'pending_uid' },
            ...actorFor(user),
          }),
        ).rejects.toBeInstanceOf(EnrollmentInvitationRequiredError);
        expect(await selectEnrollments([bound.id, invitation.id])).toHaveLength(2);
      }
    });
  });

  describe('merge and admission semantics', () => {
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

      const classification = classifyEnrollmentIdentityCandidates(
        await selectEnrollmentIdentityCandidates({
          courseInstanceId: courseInstance.id,
          userId: user.id,
        }),
      );
      expect(classification.actionableConventionalInvitationCandidates).toHaveLength(1);
      expect(classification.actionableRosterInvitationCandidates).toHaveLength(0);

      const admitted = await admitUserFromEnrollmentInvitation({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        source: { type: 'pending_uid' },
        ...actorFor(user),
      });
      expect(admitted).toMatchObject({ id: guest.id, is_guest: true, status: 'joined' });
    });

    it('preserves only the deliberate non-guest bound-left plus roster invitation pair', async () => {
      const user = await createUser({ prefix: 'left-roster' });
      const bound = await createEnrollment({
        courseInstance,
        userId: user.id,
        status: 'left',
        firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
      });
      const invitation = await createEnrollment({
        courseInstance,
        pendingUin: user.uin,
      });

      const result = await reconcileEnrollmentIdentities({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        ...actorFor(user),
      });

      expect(result).toMatchObject({
        enrollment: { id: bound.id, status: 'left' },
        mergedEnrollmentIds: [],
        preservedInvitation: true,
      });
      expect(await selectEnrollments([bound.id, invitation.id])).toHaveLength(2);

      const admitted = await admitUserFromEnrollmentInvitation({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        source: { type: 'institution_uin' },
        ...actorFor(user),
      });
      expect(admitted).toMatchObject({ id: bound.id, status: 'joined', user_id: user.id });
      expect(await selectEnrollments([bound.id, invitation.id])).toHaveLength(1);
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
          ...actorFor(admissionUser),
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
          ...actorFor(admissionUser),
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
        ...actorFor(user),
      });

      expect(admitted).toMatchObject({
        id: invitation.id,
        is_guest: true,
        status: 'joined',
        user_id: user.id,
      });
      expect(await selectReconciliationAuditEvents([invitation.id])).toEqual([
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
        ...actorFor(user),
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
      expect(await selectReconciliationAuditEvents([invitation.id])).toEqual([
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

      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstance.id,
        tid: 'hw19-accessControlUi',
      });
      const ruleOne = await queryRow(
        sql.insert_assessment_access_control_rule,
        {
          assessment_id: assessment.id,
          number: 90_000 + fixtureCounter++,
          uuid: crypto.randomUUID(),
        },
        AssessmentAccessControlRuleSchema,
      );
      const ruleTwo = await queryRow(
        sql.insert_assessment_access_control_rule,
        {
          assessment_id: assessment.id,
          number: 90_000 + fixtureCounter++,
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
      expect(
        await selectEnrollments([pendingUidLoser.id, survivor.id, pendingUinLoser.id]),
      ).toEqual([result.enrollment]);

      expect(await selectIds(sql.select_student_label_ids, { enrollment_id: survivor.id })).toEqual(
        [labelOne.id, labelTwo.id],
      );
      expect(
        await selectIds(sql.select_publishing_extension_ids, {
          enrollment_id: survivor.id,
        }),
      ).toEqual([extensionTieHigher.id]);
      expect(
        await selectIds(sql.select_assessment_access_control_rule_ids, {
          enrollment_id: survivor.id,
        }),
      ).toEqual([ruleOne.id, ruleTwo.id]);

      const auditEvents = await selectReconciliationAuditEvents([
        pendingUidLoser.id,
        survivor.id,
        pendingUinLoser.id,
      ]);
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
            enrollment_id: null,
            row_id: pendingUidLoser.id,
          }),
          expect.objectContaining({
            action: 'delete',
            action_detail: 'identity_merged',
            context: expect.objectContaining({ reason: 'identity_reconciliation' }),
            enrollment_id: null,
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

  describe('retry behavior', () => {
    it('retries once after a recognized concurrent bound-user uniqueness race', async () => {
      const user = await createUser({ prefix: 'recognized-race' });
      const invitation = await createEnrollment({
        courseInstance,
        pendingUin: user.uin,
      });
      const parentLocked = deferred();
      const releaseParent = deferred();
      const blocker = runInTransactionAsync(async () => {
        await queryRow(
          sql.lock_enrollment,
          { enrollment_id: invitation.id },
          z.object({ id: IdSchema }),
        );
        parentLocked.resolve();
        await releaseParent.promise;
      }).catch((error) => {
        parentLocked.reject(error);
        throw error;
      });

      let admission: Promise<Enrollment> | undefined;
      try {
        await parentLocked.promise;
        const applicationName = `reconcile-${crypto.randomUUID()}`;
        admission = runInTransactionAsync(async () => {
          await queryScalar(
            sql.set_local_application_name,
            { application_name: applicationName },
            z.string(),
          );
          return await admitUserFromEnrollmentInvitation({
            courseInstanceId: courseInstance.id,
            userId: user.id,
            source: { type: 'institution_uin' },
            ...actorFor(user),
          });
        });
        void admission.catch(() => undefined);
        await waitForReconciliationLock(applicationName);

        const concurrentBound = await createEnrollment({
          courseInstance,
          userId: user.id,
          status: 'left',
          firstJoinedAt: new Date('2025-01-01T00:00:00Z'),
        });
        releaseParent.resolve();

        const admitted = await admission;
        expect(admitted).toMatchObject({
          id: concurrentBound.id,
          status: 'joined',
          user_id: user.id,
        });
        expect(await selectEnrollments([invitation.id, concurrentBound.id])).toEqual([admitted]);
      } finally {
        releaseParent.resolve();
        await blocker;
        if (admission) await admission;
      }
    });

    it('does not retry an unrelated database error and rolls back the failed attempt', async () => {
      const user = await createUser({ prefix: 'unrelated-error' });
      const invitation = await createEnrollment({
        courseInstance,
        pendingUin: user.uin,
      });
      const sequenceBefore = BigInt(
        await queryScalar(sql.select_audit_event_sequence_value, {}, z.string()),
      );

      await expect(
        admitUserFromEnrollmentInvitation({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          source: { type: 'institution_uin' },
          agentAuthnUserId: '999999999999999999',
          agentUserId: '999999999999999999',
        }),
      ).rejects.toMatchObject({ code: '23503' });

      const sequenceAfter = BigInt(
        await queryScalar(sql.select_audit_event_sequence_value, {}, z.string()),
      );
      expect(sequenceAfter - sequenceBefore).toBe(1n);
      expect(await selectEnrollments([invitation.id])).toEqual([invitation]);
    });
  });
});
