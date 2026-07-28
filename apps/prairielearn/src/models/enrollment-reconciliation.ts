import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalScalar,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type Enrollment, EnrollmentSchema, type EnumEnrollmentStatus } from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';
import { runWithSharedEnrollmentBarrier } from './enrollment-barrier.js';
import { lockEnrollments } from './enrollment-lock.js';

const sql = loadSqlEquiv(import.meta.url);

const MAX_RECONCILIATION_ATTEMPTS = 2;
const ENROLLMENT_IDENTITY_UNIQUE_CONSTRAINTS = new Set([
  'enrollments_course_instance_id_pending_uin_key',
  'enrollments_pending_lti13_ciid_sub_course_instance_id_key',
  'enrollments_pending_uid_course_instance_id_key',
  'enrollments_user_id_course_instance_id_key',
]);

const EnrollmentIdentityCandidateRowSchema = z.object({
  enrollment: EnrollmentSchema,
  matches_bound_user: z.boolean(),
  matches_institution_uin: z.boolean(),
  matches_lti13: z.boolean(),
  matches_pending_uid: z.boolean(),
});

export interface EnrollmentIdentityCandidate {
  enrollment: Enrollment;
  matches: {
    boundUser: boolean;
    institutionUin: boolean;
    lti13: boolean;
    pendingUid: boolean;
  };
}

export type EnrollmentIdentityClassificationKind =
  | 'none'
  | 'ordinary'
  | 'actionable_conventional_invitation'
  | 'actionable_roster_invitation'
  | 'joined'
  | 'blocked';

export interface EnrollmentIdentityClassification {
  actionableConventionalInvitationCandidates: EnrollmentIdentityCandidate[];
  actionableInstitutionRosterInvitationCandidates: EnrollmentIdentityCandidate[];
  actionableLti13RosterInvitationCandidates: EnrollmentIdentityCandidate[];
  actionableRosterInvitationCandidates: EnrollmentIdentityCandidate[];
  boundCandidate: EnrollmentIdentityCandidate | null;
  candidates: EnrollmentIdentityCandidate[];
  conventionalInvitationCandidates: EnrollmentIdentityCandidate[];
  institutionRosterInvitationCandidates: EnrollmentIdentityCandidate[];
  kind: EnrollmentIdentityClassificationKind;
  lti13RosterInvitationCandidates: EnrollmentIdentityCandidate[];
  rosterInvitationCandidates: EnrollmentIdentityCandidate[];
}

export interface EnrollmentIdentityReconciliationResult {
  classification: EnrollmentIdentityClassification;
  enrollment: Enrollment | null;
  mergedEnrollmentIds: string[];
  preservedInvitation: boolean;
}

export type EnrollmentAdmissionSource =
  | { type: 'pending_uid' }
  | { type: 'institution_uin' }
  | {
      type: 'lti13';
      lti13CourseInstanceId: string;
      sub: string;
    };

interface EnrollmentIdentityContext {
  courseInstanceId: string;
  lti13Identity?: {
    lti13CourseInstanceId: string;
    sub: string;
  };
  userId: string;
}

interface EnrollmentAuditActor {
  agentAuthnUserId: string | null;
  agentUserId: string | null;
}

export class EnrollmentAdmissionBlockedError extends Error {
  constructor() {
    super('A blocked enrollment cannot be admitted');
    this.name = 'EnrollmentAdmissionBlockedError';
  }
}

export class EnrollmentInvitationRequiredError extends Error {
  constructor(source: EnrollmentAdmissionSource['type']) {
    super(`A matching ${source} invitation is required`);
    this.name = 'EnrollmentInvitationRequiredError';
  }
}

function mapCandidateRows(
  rows: z.infer<typeof EnrollmentIdentityCandidateRowSchema>[],
): EnrollmentIdentityCandidate[] {
  return rows.map((row) => ({
    enrollment: row.enrollment,
    matches: {
      boundUser: row.matches_bound_user,
      institutionUin: row.matches_institution_uin,
      lti13: row.matches_lti13,
      pendingUid: row.matches_pending_uid,
    },
  }));
}

function identityQueryParams({
  courseInstanceId,
  userId,
  lti13Identity,
}: EnrollmentIdentityContext) {
  return {
    course_instance_id: courseInstanceId,
    lti13_course_instance_id: lti13Identity?.lti13CourseInstanceId ?? null,
    lti13_sub: lti13Identity?.sub ?? null,
    user_id: userId,
  };
}

/**
 * Selects all enrollment rows matching the current bound-user, pending-UID,
 * institution-scoped UIN, or optional exact LTI identity. The query is strictly
 * read-only and returns one candidate per enrollment with every matching source
 * preserved as provenance.
 *
 * User identity fields and LTI link ownership are intentionally not locked.
 * Callers performing reconciliation re-run this selector inside their
 * transaction and revalidate the locked enrollment rows before mutation. A
 * rare concurrent user/LTI identity change may therefore be completed by a
 * later reconciliation call.
 */
export async function selectEnrollmentIdentityCandidates(
  context: EnrollmentIdentityContext,
): Promise<EnrollmentIdentityCandidate[]> {
  const rows = await queryRows(
    sql.select_enrollment_identity_candidates,
    identityQueryParams(context),
    EnrollmentIdentityCandidateRowSchema,
  );
  return mapCandidateRows(rows);
}

async function revalidateLockedEnrollmentIdentityCandidates(
  context: EnrollmentIdentityContext,
  enrollmentIds: string[],
): Promise<EnrollmentIdentityCandidate[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = await queryRows(
    sql.revalidate_locked_enrollment_identity_candidates,
    {
      ...identityQueryParams(context),
      enrollment_ids: enrollmentIds,
    },
    EnrollmentIdentityCandidateRowSchema,
  );
  return mapCandidateRows(rows);
}

function isPendingInvitation(candidate: EnrollmentIdentityCandidate): boolean {
  return candidate.enrollment.user_id === null && candidate.enrollment.status === 'invited';
}

/**
 * Classifies identity candidates without performing database work. Conventional
 * pending-UID invitations remain distinct from roster authorization. Only a
 * non-guest pending invitation matched through institution-scoped UIN or exact
 * LTI provenance can authorize roster admission; bound left/removed/blocked
 * rows never authorize it by themselves.
 */
export function classifyEnrollmentIdentityCandidates(
  candidates: EnrollmentIdentityCandidate[],
): EnrollmentIdentityClassification {
  const boundCandidates = candidates.filter(
    (candidate) => candidate.matches.boundUser && candidate.enrollment.user_id !== null,
  );
  if (boundCandidates.length > 1) {
    throw new Error('Multiple bound enrollment identity candidates');
  }

  const boundCandidate = boundCandidates.at(0) ?? null;
  const pendingInvitations = candidates.filter(isPendingInvitation);
  const conventionalInvitationCandidates = pendingInvitations.filter(
    (candidate) => candidate.matches.pendingUid,
  );
  const institutionRosterInvitationCandidates = pendingInvitations.filter(
    (candidate) => !candidate.enrollment.is_guest && candidate.matches.institutionUin,
  );
  const lti13RosterInvitationCandidates = pendingInvitations.filter(
    (candidate) => !candidate.enrollment.is_guest && candidate.matches.lti13,
  );
  const rosterInvitationCandidates = pendingInvitations.filter(
    (candidate) =>
      !candidate.enrollment.is_guest &&
      (candidate.matches.institutionUin || candidate.matches.lti13),
  );

  const boundEnrollment = boundCandidate?.enrollment;
  const boundAllowsRosterInvitation =
    boundEnrollment === undefined ||
    (boundEnrollment.status === 'left' && !boundEnrollment.is_guest);
  const actionableConventionalInvitationCandidates =
    boundEnrollment === undefined ? conventionalInvitationCandidates : [];
  const rosterAdmissionKeepsNonGuest =
    boundAllowsRosterInvitation && !candidates.some((candidate) => candidate.enrollment.is_guest);
  const actionableInstitutionRosterInvitationCandidates = rosterAdmissionKeepsNonGuest
    ? institutionRosterInvitationCandidates
    : [];
  const actionableLti13RosterInvitationCandidates = rosterAdmissionKeepsNonGuest
    ? lti13RosterInvitationCandidates
    : [];
  const actionableRosterInvitationCandidates = rosterAdmissionKeepsNonGuest
    ? rosterInvitationCandidates
    : [];

  const boundStatus = boundEnrollment?.status;
  let kind: EnrollmentIdentityClassificationKind;
  if (boundStatus === 'blocked') {
    kind = 'blocked';
  } else if (boundStatus === 'joined') {
    kind = 'joined';
  } else if (actionableRosterInvitationCandidates.length > 0) {
    kind = 'actionable_roster_invitation';
  } else if (actionableConventionalInvitationCandidates.length > 0) {
    kind = 'actionable_conventional_invitation';
  } else if (candidates.length > 0) {
    kind = 'ordinary';
  } else {
    kind = 'none';
  }

  return {
    actionableConventionalInvitationCandidates,
    actionableInstitutionRosterInvitationCandidates,
    actionableLti13RosterInvitationCandidates,
    actionableRosterInvitationCandidates,
    boundCandidate,
    candidates,
    conventionalInvitationCandidates,
    institutionRosterInvitationCandidates,
    kind,
    lti13RosterInvitationCandidates,
    rosterInvitationCandidates,
  };
}

function compareEnrollmentIds(
  a: EnrollmentIdentityCandidate,
  b: EnrollmentIdentityCandidate,
): number {
  const aId = BigInt(a.enrollment.id);
  const bId = BigInt(b.enrollment.id);
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

function selectSurvivor(
  classification: EnrollmentIdentityClassification,
): EnrollmentIdentityCandidate | null {
  if (classification.boundCandidate) return classification.boundCandidate;

  const guestCandidates = classification.candidates.filter(
    (candidate) => candidate.enrollment.is_guest,
  );
  if (guestCandidates.length === 1) return guestCandidates[0];

  return classification.candidates.slice().sort(compareEnrollmentIds)[0] ?? null;
}

function selectEarliestFirstJoinedAt(candidates: EnrollmentIdentityCandidate[]): Date | null {
  const joinedDates = candidates
    .map((candidate) => candidate.enrollment.first_joined_at)
    .filter((date): date is Date => date !== null);
  if (joinedDates.length === 0) return null;
  return new Date(Math.min(...joinedDates.map((date) => date.getTime())));
}

/**
 * A pending enrollment has only one slot for each identity kind. Prefer the
 * value that matched the current user, then the survivor's value, then the
 * lowest-ID candidate's value. For LTI, an exact supplied source wins before
 * the survivor or lowest-ID associated pair. Its UIN remains coupled to that
 * pair; only candidates without an LTI association use the general UIN
 * preference. Display data follows the survivor and then those same identity
 * preferences.
 */
function selectMergedPendingFields({
  candidates,
  survivorCandidate,
}: {
  candidates: EnrollmentIdentityCandidate[];
  survivorCandidate: EnrollmentIdentityCandidate;
}): Pick<
  Enrollment,
  | 'pending_email'
  | 'pending_lti13_course_instance_id'
  | 'pending_lti13_sub'
  | 'pending_name'
  | 'pending_uid'
  | 'pending_uin'
> {
  if (survivorCandidate.enrollment.user_id !== null) {
    return {
      pending_email: null,
      pending_lti13_course_instance_id: null,
      pending_lti13_sub: null,
      pending_name: null,
      pending_uid: null,
      pending_uin: null,
    };
  }

  const orderedCandidates = candidates.slice().sort(compareEnrollmentIds);
  const pendingUidCandidate = orderedCandidates.find(
    (candidate) => candidate.matches.pendingUid && candidate.enrollment.pending_uid !== null,
  );
  const institutionUinCandidate = orderedCandidates.find(
    (candidate) => candidate.matches.institutionUin && candidate.enrollment.pending_uin !== null,
  );
  const exactLti13Candidate = orderedCandidates.find(
    (candidate) =>
      candidate.matches.lti13 &&
      candidate.enrollment.pending_lti13_course_instance_id !== null &&
      candidate.enrollment.pending_lti13_sub !== null,
  );
  const associatedLti13Candidate =
    exactLti13Candidate ??
    (survivorCandidate.enrollment.pending_lti13_course_instance_id !== null &&
    survivorCandidate.enrollment.pending_lti13_sub !== null
      ? survivorCandidate
      : orderedCandidates.find(
          (candidate) =>
            candidate.enrollment.pending_lti13_course_instance_id !== null &&
            candidate.enrollment.pending_lti13_sub !== null,
        ));
  const displayCandidates = [
    survivorCandidate,
    exactLti13Candidate,
    institutionUinCandidate,
    pendingUidCandidate,
    ...orderedCandidates,
  ].filter((candidate): candidate is EnrollmentIdentityCandidate => candidate !== undefined);

  return {
    pending_email:
      displayCandidates.find((candidate) => candidate.enrollment.pending_email !== null)?.enrollment
        .pending_email ?? null,
    pending_lti13_course_instance_id:
      associatedLti13Candidate?.enrollment.pending_lti13_course_instance_id ?? null,
    pending_lti13_sub: associatedLti13Candidate?.enrollment.pending_lti13_sub ?? null,
    pending_name:
      displayCandidates.find((candidate) => candidate.enrollment.pending_name !== null)?.enrollment
        .pending_name ?? null,
    pending_uid:
      pendingUidCandidate?.enrollment.pending_uid ??
      survivorCandidate.enrollment.pending_uid ??
      orderedCandidates.find((candidate) => candidate.enrollment.pending_uid !== null)?.enrollment
        .pending_uid ??
      null,
    pending_uin:
      associatedLti13Candidate?.enrollment.pending_uin ??
      institutionUinCandidate?.enrollment.pending_uin ??
      survivorCandidate.enrollment.pending_uin ??
      orderedCandidates.find((candidate) => candidate.enrollment.pending_uin !== null)?.enrollment
        .pending_uin ??
      null,
  };
}

async function lockAndMoveEnrollmentDependents({
  enrollmentIds,
  loserEnrollmentIds,
  survivorEnrollmentId,
}: {
  enrollmentIds: string[];
  loserEnrollmentIds: string[];
  survivorEnrollmentId: string;
}): Promise<void> {
  const params = { enrollment_ids: enrollmentIds };

  // This order must remain aligned with enrollment-reconciliation.sql and with
  // the parent-first locking contract established by enrollment-lock.ts.
  await queryRows(sql.lock_student_label_enrollments, params, z.object({ id: IdSchema }));
  await queryRows(sql.lock_publishing_extension_enrollments, params, z.object({ id: IdSchema }));
  await queryRows(
    sql.lock_assessment_access_control_enrollments,
    params,
    z.object({ id: IdSchema }),
  );

  await execute(sql.union_student_label_enrollments, {
    ...params,
    survivor_enrollment_id: survivorEnrollmentId,
  });
  await execute(sql.delete_loser_student_label_enrollments, {
    loser_enrollment_ids: loserEnrollmentIds,
  });

  const publishingExtensionId = await queryOptionalScalar(
    sql.select_best_publishing_extension_id,
    params,
    IdSchema,
  );
  await execute(sql.delete_candidate_publishing_extension_enrollments, params);
  if (publishingExtensionId !== null) {
    await execute(sql.insert_survivor_publishing_extension_enrollment, {
      publishing_extension_id: publishingExtensionId,
      survivor_enrollment_id: survivorEnrollmentId,
    });
  }

  await execute(sql.union_assessment_access_control_enrollments, {
    ...params,
    survivor_enrollment_id: survivorEnrollmentId,
  });
  await execute(sql.delete_loser_assessment_access_control_enrollments, {
    loser_enrollment_ids: loserEnrollmentIds,
  });
}

function enrollmentChanged(oldEnrollment: Enrollment, newEnrollment: Enrollment): boolean {
  return (
    oldEnrollment.status !== newEnrollment.status ||
    oldEnrollment.is_guest !== newEnrollment.is_guest ||
    oldEnrollment.first_joined_at?.getTime() !== newEnrollment.first_joined_at?.getTime() ||
    oldEnrollment.pending_uid !== newEnrollment.pending_uid ||
    oldEnrollment.pending_uin !== newEnrollment.pending_uin ||
    oldEnrollment.pending_name !== newEnrollment.pending_name ||
    oldEnrollment.pending_email !== newEnrollment.pending_email ||
    oldEnrollment.pending_lti13_course_instance_id !==
      newEnrollment.pending_lti13_course_instance_id ||
    oldEnrollment.pending_lti13_sub !== newEnrollment.pending_lti13_sub
  );
}

async function auditReconciliation({
  actor,
  oldSurvivor,
  newSurvivor,
  deletedEnrollments,
  admissionSource,
}: {
  actor: EnrollmentAuditActor;
  oldSurvivor: Enrollment;
  newSurvivor: Enrollment;
  deletedEnrollments: Enrollment[];
  admissionSource?: EnrollmentAdmissionSource;
}): Promise<void> {
  if (admissionSource || enrollmentChanged(oldSurvivor, newSurvivor)) {
    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'update',
      actionDetail:
        admissionSource !== undefined
          ? admissionSource.type === 'pending_uid'
            ? 'invitation_accepted'
            : 'roster_admitted'
          : 'identity_reconciled',
      rowId: newSurvivor.id,
      oldRow: oldSurvivor,
      newRow: newSurvivor,
      context: {
        reason: 'identity_reconciliation',
        admission_source: admissionSource?.type ?? null,
      },
      subjectUserId: newSurvivor.user_id,
      agentUserId: actor.agentUserId,
      agentAuthnUserId: actor.agentAuthnUserId,
    });
  }

  for (const deletedEnrollment of deletedEnrollments
    .slice()
    .sort((a, b) =>
      compareEnrollmentIds(
        { enrollment: a, matches: emptyMatches },
        { enrollment: b, matches: emptyMatches },
      ),
    )) {
    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'delete',
      actionDetail: 'identity_merged',
      rowId: deletedEnrollment.id,
      oldRow: deletedEnrollment,
      context: {
        reason: 'identity_reconciliation',
        survivor_enrollment_id: newSurvivor.id,
      },
      subjectUserId: deletedEnrollment.user_id,
      courseInstanceId: deletedEnrollment.course_instance_id,
      enrollmentId: null,
      agentUserId: actor.agentUserId,
      agentAuthnUserId: actor.agentAuthnUserId,
    });
  }
}

const emptyMatches = {
  boundUser: false,
  institutionUin: false,
  lti13: false,
  pendingUid: false,
};

function isEnrollmentIdentityUniquenessViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return (
    code === '23505' &&
    typeof constraint === 'string' &&
    ENROLLMENT_IDENTITY_UNIQUE_CONSTRAINTS.has(constraint)
  );
}

function shouldPreserveRosterInvitation(classification: EnrollmentIdentityClassification): boolean {
  const boundEnrollment = classification.boundCandidate?.enrollment;
  return (
    boundEnrollment?.status === 'left' &&
    !boundEnrollment.is_guest &&
    classification.actionableRosterInvitationCandidates.length > 0
  );
}

async function runReconciliationAttempt({
  context,
  actor,
  admissionSource,
}: {
  context: EnrollmentIdentityContext;
  actor: EnrollmentAuditActor;
  admissionSource?: EnrollmentAdmissionSource;
}): Promise<EnrollmentIdentityReconciliationResult> {
  const initialCandidates = await selectEnrollmentIdentityCandidates(context);
  const initialCandidateIds = initialCandidates.map((candidate) => candidate.enrollment.id);
  await lockEnrollments(initialCandidateIds);

  const candidates = await revalidateLockedEnrollmentIdentityCandidates(
    context,
    initialCandidateIds,
  );
  const classification = classifyEnrollmentIdentityCandidates(candidates);

  if (admissionSource && classification.kind === 'blocked') {
    throw new EnrollmentAdmissionBlockedError();
  }

  if (admissionSource) {
    const authorizedCandidates = {
      institution_uin: classification.actionableInstitutionRosterInvitationCandidates,
      lti13: classification.actionableLti13RosterInvitationCandidates,
      pending_uid: classification.actionableConventionalInvitationCandidates,
    }[admissionSource.type];
    if (authorizedCandidates.length === 0) {
      throw new EnrollmentInvitationRequiredError(admissionSource.type);
    }
  } else if (shouldPreserveRosterInvitation(classification)) {
    return {
      classification,
      enrollment: classification.boundCandidate?.enrollment ?? null,
      mergedEnrollmentIds: [],
      preservedInvitation: true,
    };
  }

  const survivorCandidate = selectSurvivor(classification);
  if (survivorCandidate === null) {
    if (admissionSource) {
      throw new EnrollmentInvitationRequiredError(admissionSource.type);
    }
    return {
      classification,
      enrollment: null,
      mergedEnrollmentIds: [],
      preservedInvitation: false,
    };
  }

  const survivor = survivorCandidate.enrollment;
  const losers = candidates
    .filter((candidate) => candidate.enrollment.id !== survivor.id)
    .map((candidate) => candidate.enrollment);
  const loserEnrollmentIds = losers.map((enrollment) => enrollment.id);
  const candidateEnrollmentIds = candidates.map((candidate) => candidate.enrollment.id);
  const isGuest = candidates.some((candidate) => candidate.enrollment.is_guest);
  const firstJoinedAt = selectEarliestFirstJoinedAt(candidates);
  const mergedPendingFields = selectMergedPendingFields({
    candidates,
    survivorCandidate,
  });

  if (losers.length > 0) {
    await lockAndMoveEnrollmentDependents({
      enrollmentIds: candidateEnrollmentIds,
      loserEnrollmentIds,
      survivorEnrollmentId: survivor.id,
    });
  }

  // Pending identity keys can be owned by loser rows. Delete them before
  // copying the deterministic identity union to an unbound survivor; the
  // attempt savepoint restores the rows if the following update fails.
  const deletedEnrollments =
    loserEnrollmentIds.length === 0
      ? []
      : await queryRows(
          sql.delete_loser_enrollments,
          { loser_enrollment_ids: loserEnrollmentIds },
          EnrollmentSchema,
        );

  let updatedSurvivor: Enrollment;
  if (admissionSource) {
    updatedSurvivor = await queryRow(
      sql.admit_reconciled_enrollment,
      {
        enrollment_id: survivor.id,
        first_joined_at: firstJoinedAt,
        is_guest: isGuest,
        user_id: context.userId,
      },
      EnrollmentSchema,
    );
  } else {
    const mergedStatus: EnumEnrollmentStatus =
      survivor.user_id === null &&
      candidates.some((candidate) => candidate.enrollment.status === 'invited')
        ? 'invited'
        : survivor.status;
    const mergedEnrollment = {
      ...survivor,
      first_joined_at: firstJoinedAt,
      is_guest: isGuest,
      ...mergedPendingFields,
      status: mergedStatus,
    };
    updatedSurvivor = enrollmentChanged(survivor, mergedEnrollment)
      ? await queryRow(
          sql.update_reconciled_enrollment,
          {
            enrollment_id: survivor.id,
            first_joined_at: firstJoinedAt,
            is_guest: isGuest,
            ...mergedPendingFields,
            status: mergedStatus,
          },
          EnrollmentSchema,
        )
      : survivor;
  }

  await auditReconciliation({
    actor,
    oldSurvivor: survivor,
    newSurvivor: updatedSurvivor,
    deletedEnrollments,
    admissionSource,
  });

  return {
    classification,
    enrollment: updatedSurvivor,
    mergedEnrollmentIds: loserEnrollmentIds,
    preservedInvitation: false,
  };
}

async function runReconciliationWithRetry({
  context,
  actor,
  admissionSource,
}: {
  context: EnrollmentIdentityContext;
  actor: EnrollmentAuditActor;
  admissionSource?: EnrollmentAdmissionSource;
}): Promise<EnrollmentIdentityReconciliationResult> {
  return await runWithSharedEnrollmentBarrier(context.courseInstanceId, async () => {
    for (let attempt = 1; attempt <= MAX_RECONCILIATION_ATTEMPTS; attempt++) {
      await execute(sql.create_enrollment_identity_reconciliation_savepoint);
      try {
        const result = await runReconciliationAttempt({
          context,
          actor,
          admissionSource,
        });
        await execute(sql.release_enrollment_identity_reconciliation_savepoint);
        return result;
      } catch (error) {
        await execute(sql.rollback_enrollment_identity_reconciliation_savepoint);
        await execute(sql.release_enrollment_identity_reconciliation_savepoint);

        if (
          attempt === MAX_RECONCILIATION_ATTEMPTS ||
          !isEnrollmentIdentityUniquenessViolation(error)
        ) {
          throw error;
        }
      }
    }

    throw new Error('Enrollment identity reconciliation exhausted its attempts');
  });
}

/**
 * Reconciles duplicate identity candidates without admitting the user. Pending
 * candidates remain pending and unbound. A non-guest bound-left enrollment
 * plus an actionable roster invitation is deliberately preserved for the later
 * checked admission flow.
 */
export async function reconcileEnrollmentIdentities({
  userId,
  courseInstanceId,
  lti13Identity,
  agentUserId,
  agentAuthnUserId,
}: EnrollmentIdentityContext &
  EnrollmentAuditActor): Promise<EnrollmentIdentityReconciliationResult> {
  return await runReconciliationWithRetry({
    context: { userId, courseInstanceId, lti13Identity },
    actor: { agentUserId, agentAuthnUserId },
  });
}

/**
 * Admits a user only from the explicitly requested invitation identity source.
 * A conventional pending-UID invitation may be accepted even when it is a
 * guest enrollment, while guest UIN/LTI matches never provide roster
 * authorization. LTI callers must supply the exact link and subject; an
 * institution-UIN match cannot accidentally authorize an LTI launch with the
 * wrong source.
 */
export async function admitUserFromEnrollmentInvitation({
  userId,
  courseInstanceId,
  source,
  agentUserId,
  agentAuthnUserId,
}: {
  courseInstanceId: string;
  source: EnrollmentAdmissionSource;
  userId: string;
} & EnrollmentAuditActor): Promise<Enrollment> {
  const lti13Identity =
    source.type === 'lti13'
      ? {
          lti13CourseInstanceId: source.lti13CourseInstanceId,
          sub: source.sub,
        }
      : undefined;
  const result = await runReconciliationWithRetry({
    context: { userId, courseInstanceId, lti13Identity },
    actor: { agentUserId, agentAuthnUserId },
    admissionSource: source,
  });
  if (result.enrollment === null) {
    throw new EnrollmentInvitationRequiredError(source.type);
  }
  return result.enrollment;
}
