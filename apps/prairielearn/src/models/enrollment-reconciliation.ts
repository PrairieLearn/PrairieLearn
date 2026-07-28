import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type Enrollment, EnrollmentSchema, type EnumEnrollmentStatus } from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';
import { runWithSharedEnrollmentBarrier } from './enrollment-barrier.js';
import {
  type EnrollmentAdmissionDecision,
  type EnrollmentAdmissionSource,
  type EnrollmentIdentityCandidate,
  type EnrollmentIdentityClassification,
  type EnrollmentIdentityContext,
  type EnrollmentInvitationAdmissionSource,
  type LockedEnrollmentAdmissionSourceSelector,
  selectLockedEnrollmentIdentityClassification,
  selectLockedEnrollmentIdentityDecision,
} from './enrollment-identity.js';

const sql = loadSqlEquiv(import.meta.url);

const MAX_RECONCILIATION_ATTEMPTS = 2;
const ENROLLMENT_IDENTITY_UNIQUE_CONSTRAINTS = new Set([
  'enrollments_course_instance_id_pending_uin_key',
  'enrollments_pending_lti13_ciid_sub_course_instance_id_key',
  'enrollments_pending_uid_course_instance_id_key',
  'enrollments_user_id_course_instance_id_key',
]);

export interface EnrollmentAuditActor {
  agentAuthnUserId: string | null;
  agentUserId: string | null;
}

export interface EnrollmentIdentityReconciliationResult {
  enrollment: Enrollment | null;
  mergedEnrollmentIds: string[];
  preservedRosterInvitation: Enrollment | null;
}

export interface EnrollmentAdmissionValidationContext {
  readonly enrollmentAction: 'insert' | 'reconcile';
  readonly source: EnrollmentAdmissionSource;
}

/**
 * Validates every caller-owned eligibility and admission rule after identity
 * parents are locked but before any mutation. The callback may run twice after
 * a recognized uniqueness race, so it must be retry-safe and must not perform
 * non-transactional or external side effects.
 */
export type ValidateEnrollmentAdmission = (
  context: EnrollmentAdmissionValidationContext,
) => Promise<void>;

export interface CheckedEnrollmentAdmissionInput extends EnrollmentAuditActor {
  readonly courseInstanceId: string;
  /**
   * Pins invitation authority to the enrollment selected by a rendered or
   * otherwise previously resolved action.
   */
  readonly expectedInvitationEnrollmentId?: string;
  /**
   * Selects the authoritative source synchronously from the locked complete
   * classification. This may run again after a uniqueness retry and must not
   * perform side effects.
   */
  readonly selectSource?: LockedEnrollmentAdmissionSourceSelector;
  readonly source: EnrollmentAdmissionSource;
  readonly userId: string;
  readonly validateAdmission: ValidateEnrollmentAdmission;
}

export class EnrollmentAdmissionDeniedError extends Error {
  decision: Extract<EnrollmentAdmissionDecision, { allowed: false }>;

  constructor(decision: Extract<EnrollmentAdmissionDecision, { allowed: false }>) {
    super(`Enrollment admission denied: ${decision.reason}`);
    this.name = 'EnrollmentAdmissionDeniedError';
    this.decision = decision;
  }
}

export class EnrollmentAdmissionBlockedError extends EnrollmentAdmissionDeniedError {
  constructor(decision: Extract<EnrollmentAdmissionDecision, { allowed: false }>) {
    super(decision);
    this.name = 'EnrollmentAdmissionBlockedError';
  }
}

export class EnrollmentInvitationRequiredError extends EnrollmentAdmissionDeniedError {
  constructor(decision: Extract<EnrollmentAdmissionDecision, { allowed: false }>) {
    super(decision);
    this.message = `A matching ${decision.source.type} invitation is required`;
    this.name = 'EnrollmentInvitationRequiredError';
  }
}

function compareEnrollmentIds(
  a: EnrollmentIdentityCandidate,
  b: EnrollmentIdentityCandidate,
): number {
  const aId = BigInt(a.enrollment.id);
  const bId = BigInt(b.enrollment.id);
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

function selectLowestEnrollmentCandidate(
  candidates: readonly EnrollmentIdentityCandidate[],
): EnrollmentIdentityCandidate | null {
  return candidates.slice().sort(compareEnrollmentIds)[0] ?? null;
}

function selectSurvivor(
  classification: EnrollmentIdentityClassification,
): EnrollmentIdentityCandidate | null {
  if (classification.boundCandidate) return classification.boundCandidate;

  const guestCandidates = classification.candidates.filter(
    (candidate) => candidate.enrollment.is_guest,
  );
  if (guestCandidates.length === 1) return guestCandidates[0];

  return selectLowestEnrollmentCandidate(classification.candidates);
}

function selectEarliestFirstJoinedAt(
  candidates: readonly EnrollmentIdentityCandidate[],
): Date | null {
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
  candidates: readonly EnrollmentIdentityCandidate[];
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
  survivorEnrollmentId,
}: {
  enrollmentIds: string[];
  survivorEnrollmentId: string;
}): Promise<void> {
  const params = {
    enrollment_ids: enrollmentIds,
    survivor_enrollment_id: survivorEnrollmentId,
  };
  const lockParams = { enrollment_ids: enrollmentIds };

  // Every child table is locked and mutated in this fixed order after all
  // enrollment parents. Updates change only enrollment_id, so reconciliation
  // never acquires an unchanged label/extension/rule owner FK lock.
  await queryRows(sql.lock_student_label_enrollments, lockParams, z.object({ id: IdSchema }));
  await queryRows(
    sql.lock_publishing_extension_enrollments,
    lockParams,
    z.object({ id: IdSchema }),
  );
  await queryRows(
    sql.lock_assessment_access_control_enrollments,
    lockParams,
    z.object({ id: IdSchema }),
  );

  await execute(sql.deduplicate_student_label_enrollments, params);
  await execute(sql.move_student_label_enrollments, params);
  await execute(sql.keep_best_publishing_extension_enrollment, params);
  await execute(sql.move_publishing_extension_enrollment, params);
  await execute(sql.deduplicate_assessment_access_control_enrollments, params);
  await execute(sql.move_assessment_access_control_enrollments, params);
}

function enrollmentChanged(oldEnrollment: Enrollment, newEnrollment: Enrollment): boolean {
  return (
    oldEnrollment.status !== newEnrollment.status ||
    oldEnrollment.user_id !== newEnrollment.user_id ||
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

function admissionActionDetail(source: EnrollmentAdmissionSource) {
  if (source.type === 'ordinary') return 'implicit_joined' as const;
  if (source.type === 'pending_uid') return 'invitation_accepted' as const;
  return 'roster_admitted' as const;
}

async function auditCandidateMerge({
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
  admissionSource: EnrollmentAdmissionSource | null;
}): Promise<void> {
  if (admissionSource !== null || enrollmentChanged(oldSurvivor, newSurvivor)) {
    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'update',
      actionDetail:
        admissionSource === null ? 'identity_reconciled' : admissionActionDetail(admissionSource),
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
      enrollmentId: newSurvivor.id,
      agentUserId: actor.agentUserId,
      agentAuthnUserId: actor.agentAuthnUserId,
    });
  }
}

async function auditInsertedAdmission({
  actor,
  enrollment,
}: {
  actor: EnrollmentAuditActor;
  enrollment: Enrollment;
}): Promise<void> {
  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'insert',
    actionDetail: 'implicit_joined',
    rowId: enrollment.id,
    newRow: enrollment,
    context: {
      reason: 'checked_admission',
      admission_source: 'ordinary',
    },
    subjectUserId: enrollment.user_id,
    agentUserId: actor.agentUserId,
    agentAuthnUserId: actor.agentAuthnUserId,
  });
}

const emptyMatches = {
  boundUser: false,
  institutionUin: false,
  lti13: false,
  pendingUid: false,
};

type CandidateMergeMutation =
  | { type: 'merge_only' }
  | {
      source: EnrollmentAdmissionSource;
      type: 'admit';
      userId: string;
    };

interface CandidateMergePlan {
  readonly candidateEnrollmentIds: string[];
  readonly firstJoinedAt: Date | null;
  readonly isGuest: boolean;
  readonly loserEnrollmentIds: string[];
  readonly mergedPendingFields: ReturnType<typeof selectMergedPendingFields>;
  readonly mergedStatus: EnumEnrollmentStatus;
  readonly mutation: CandidateMergeMutation;
  readonly survivor: Enrollment;
}

function planCandidateMerge({
  candidates,
  mutation,
  survivorCandidate,
}: {
  candidates: readonly EnrollmentIdentityCandidate[];
  mutation: CandidateMergeMutation;
  survivorCandidate: EnrollmentIdentityCandidate;
}): CandidateMergePlan {
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
  const mergedStatus: EnumEnrollmentStatus =
    survivor.user_id === null &&
    candidates.some((candidate) => candidate.enrollment.status === 'invited')
      ? 'invited'
      : survivor.status;

  return {
    candidateEnrollmentIds,
    firstJoinedAt,
    isGuest,
    loserEnrollmentIds,
    mergedPendingFields,
    mergedStatus,
    mutation,
    survivor,
  };
}

async function executeCandidateMerge({
  actor,
  plan,
}: {
  actor: EnrollmentAuditActor;
  plan: CandidateMergePlan;
}): Promise<{ enrollment: Enrollment; mergedEnrollmentIds: string[] }> {
  const {
    candidateEnrollmentIds,
    firstJoinedAt,
    isGuest,
    loserEnrollmentIds,
    mergedPendingFields,
    mergedStatus,
    mutation,
    survivor,
  } = plan;

  if (loserEnrollmentIds.length > 0) {
    await lockAndMoveEnrollmentDependents({
      enrollmentIds: candidateEnrollmentIds,
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
  if (mutation.type === 'admit') {
    updatedSurvivor = await queryRow(
      sql.admit_reconciled_enrollment,
      {
        enrollment_id: survivor.id,
        first_joined_at: firstJoinedAt,
        is_guest: isGuest,
        user_id: mutation.userId,
      },
      EnrollmentSchema,
    );
  } else {
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

  await auditCandidateMerge({
    actor,
    oldSurvivor: survivor,
    newSurvivor: updatedSurvivor,
    deletedEnrollments,
    admissionSource: mutation.type === 'admit' ? mutation.source : null,
  });

  return {
    enrollment: updatedSurvivor,
    mergedEnrollmentIds: loserEnrollmentIds,
  };
}

function isEnrollmentIdentityUniquenessViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return (
    code === '23505' &&
    typeof constraint === 'string' &&
    ENROLLMENT_IDENTITY_UNIQUE_CONSTRAINTS.has(constraint)
  );
}

async function runWithEnrollmentIdentityRetry<T>({
  context,
  attempt,
}: {
  attempt: () => Promise<T>;
  context: EnrollmentIdentityContext;
}): Promise<T> {
  return await runWithSharedEnrollmentBarrier(context.courseInstanceId, async () => {
    for (let attemptNumber = 1; attemptNumber <= MAX_RECONCILIATION_ATTEMPTS; attemptNumber++) {
      await execute(sql.create_enrollment_identity_reconciliation_savepoint);
      try {
        const result = await attempt();
        await execute(sql.release_enrollment_identity_reconciliation_savepoint);
        return result;
      } catch (error) {
        await execute(sql.rollback_enrollment_identity_reconciliation_savepoint);
        await execute(sql.release_enrollment_identity_reconciliation_savepoint);

        if (
          attemptNumber === MAX_RECONCILIATION_ATTEMPTS ||
          !isEnrollmentIdentityUniquenessViolation(error)
        ) {
          throw error;
        }
      }
    }

    throw new Error('Enrollment identity reconciliation exhausted its attempts');
  });
}

type MergeOnlyPlan =
  | { type: 'none' }
  | {
      candidates: readonly EnrollmentIdentityCandidate[];
      survivorCandidate: EnrollmentIdentityCandidate;
      type: 'merge';
    }
  | {
      boundCandidate: EnrollmentIdentityCandidate;
      pendingCandidates: readonly EnrollmentIdentityCandidate[];
      pendingSurvivorCandidate: EnrollmentIdentityCandidate;
      type: 'preserve_roster_invitation';
    };

function planMergeOnly(classification: EnrollmentIdentityClassification): MergeOnlyPlan {
  if (classification.candidates.length === 0) return { type: 'none' };

  const boundCandidate = classification.boundCandidate;
  if (
    boundCandidate?.enrollment.status === 'left' &&
    !boundCandidate.enrollment.is_guest &&
    classification.actionableRosterInvitationCandidates.length > 0
  ) {
    const pendingCandidates = classification.candidates.filter(
      (candidate) => candidate.enrollment.id !== boundCandidate.enrollment.id,
    );
    const pendingSurvivorCandidate = selectLowestEnrollmentCandidate(
      classification.actionableRosterInvitationCandidates,
    );
    if (pendingSurvivorCandidate === null) {
      throw new Error('Actionable roster invitation has no survivor');
    }
    return {
      boundCandidate,
      pendingCandidates,
      pendingSurvivorCandidate,
      type: 'preserve_roster_invitation',
    };
  }

  const survivorCandidate = selectSurvivor(classification);
  if (survivorCandidate === null) return { type: 'none' };
  return {
    candidates: classification.candidates,
    survivorCandidate,
    type: 'merge',
  };
}

async function executeMergeOnlyAttempt({
  actor,
  context,
}: {
  actor: EnrollmentAuditActor;
  context: EnrollmentIdentityContext;
}): Promise<EnrollmentIdentityReconciliationResult> {
  const classification = await selectLockedEnrollmentIdentityClassification(context);
  const plan = planMergeOnly(classification);

  if (plan.type === 'none') {
    return {
      enrollment: null,
      mergedEnrollmentIds: [],
      preservedRosterInvitation: null,
    };
  }
  if (plan.type === 'preserve_roster_invitation') {
    const pendingResult = await executeCandidateMerge({
      actor,
      plan: planCandidateMerge({
        candidates: plan.pendingCandidates,
        mutation: { type: 'merge_only' },
        survivorCandidate: plan.pendingSurvivorCandidate,
      }),
    });
    return {
      enrollment: plan.boundCandidate.enrollment,
      mergedEnrollmentIds: pendingResult.mergedEnrollmentIds,
      preservedRosterInvitation: pendingResult.enrollment,
    };
  }

  const result = await executeCandidateMerge({
    actor,
    plan: planCandidateMerge({
      candidates: plan.candidates,
      mutation: { type: 'merge_only' },
      survivorCandidate: plan.survivorCandidate,
    }),
  });
  return {
    enrollment: result.enrollment,
    mergedEnrollmentIds: result.mergedEnrollmentIds,
    preservedRosterInvitation: null,
  };
}

function throwAdmissionDenied(
  decision: Extract<EnrollmentAdmissionDecision, { allowed: false }>,
): never {
  if (decision.reason === 'blocked') {
    throw new EnrollmentAdmissionBlockedError(decision);
  }
  if (decision.source.type !== 'ordinary') {
    throw new EnrollmentInvitationRequiredError(decision);
  }
  throw new EnrollmentAdmissionDeniedError(decision);
}

type CheckedAdmissionPlan =
  | {
      readonly enrollment: Enrollment;
      readonly type: 'already_joined';
    }
  | {
      readonly decision: Extract<EnrollmentAdmissionDecision, { allowed: false }>;
      readonly type: 'denied';
    }
  | {
      readonly type: 'insert';
      readonly validationContext: EnrollmentAdmissionValidationContext;
    }
  | {
      readonly mergePlan: CandidateMergePlan;
      readonly type: 'reconcile';
      readonly validationContext: EnrollmentAdmissionValidationContext;
    };

function immutableValidationContext({
  enrollmentAction,
  source,
}: EnrollmentAdmissionValidationContext): EnrollmentAdmissionValidationContext {
  const immutableSource = Object.freeze({ ...source }) as EnrollmentAdmissionSource;
  return Object.freeze({ enrollmentAction, source: immutableSource });
}

function planCheckedAdmission({
  classification,
  decision,
  expectedInvitationEnrollmentId,
  source,
  userId,
}: {
  classification: EnrollmentIdentityClassification;
  decision: EnrollmentAdmissionDecision;
  expectedInvitationEnrollmentId?: string;
  source: EnrollmentAdmissionSource;
  userId: string;
}): CheckedAdmissionPlan {
  if (!decision.allowed) {
    if (
      decision.reason === 'already_joined' &&
      classification.boundCandidate !== null &&
      expectedInvitationEnrollmentId === undefined
    ) {
      return {
        enrollment: classification.boundCandidate.enrollment,
        type: 'already_joined',
      };
    }
    return { decision, type: 'denied' };
  }

  const survivorCandidate = selectSurvivor(classification);
  if (survivorCandidate === null) {
    return {
      type: 'insert',
      validationContext: immutableValidationContext({
        enrollmentAction: 'insert',
        source,
      }),
    };
  }

  return {
    mergePlan: planCandidateMerge({
      candidates: classification.candidates,
      mutation: {
        source,
        type: 'admit',
        userId,
      },
      survivorCandidate,
    }),
    type: 'reconcile',
    validationContext: immutableValidationContext({
      enrollmentAction: 'reconcile',
      source,
    }),
  };
}

async function executeCheckedAdmissionAttempt({
  actor,
  context,
  expectedInvitationEnrollmentId,
  selectSource,
  source,
  validateAdmission,
}: {
  actor: EnrollmentAuditActor;
  context: EnrollmentIdentityContext;
  expectedInvitationEnrollmentId?: string;
  selectSource?: LockedEnrollmentAdmissionSourceSelector;
  source: EnrollmentAdmissionSource;
  validateAdmission: ValidateEnrollmentAdmission;
}): Promise<Enrollment> {
  const {
    classification,
    decision,
    source: selectedSource,
  } = await selectLockedEnrollmentIdentityDecision(context, source, selectSource, {
    expectedInvitationEnrollmentId,
  });
  const plan = planCheckedAdmission({
    classification,
    decision,
    expectedInvitationEnrollmentId,
    source: selectedSource,
    userId: context.userId,
  });

  if (plan.type === 'already_joined') return plan.enrollment;
  if (plan.type === 'denied') throwAdmissionDenied(plan.decision);

  // This mandatory seam runs from the locked, source-specific decision before
  // any dependent or enrollment mutation. It can run again after the one
  // recognized uniqueness retry; failed-attempt effects are savepoint-rolled back.
  await validateAdmission(plan.validationContext);

  if (plan.type === 'insert') {
    const enrollment = await queryRow(
      sql.insert_joined_enrollment,
      {
        course_instance_id: context.courseInstanceId,
        user_id: context.userId,
      },
      EnrollmentSchema,
    );
    await auditInsertedAdmission({ actor, enrollment });
    return enrollment;
  }

  const result = await executeCandidateMerge({
    actor,
    plan: plan.mergePlan,
  });
  return result.enrollment;
}

/**
 * Reconciles duplicate identity candidates without admitting the user. A
 * non-guest bound-left enrollment plus a roster invitation remains two logical
 * rows: the bound row and exactly one fully reconciled pending roster row.
 */
export async function reconcileEnrollmentIdentities({
  userId,
  courseInstanceId,
  lti13Identity,
  agentUserId,
  agentAuthnUserId,
}: EnrollmentIdentityContext &
  EnrollmentAuditActor): Promise<EnrollmentIdentityReconciliationResult> {
  const context = { userId, courseInstanceId, lti13Identity };
  return await runWithEnrollmentIdentityRetry({
    context,
    attempt: async () =>
      await executeMergeOnlyAttempt({
        context,
        actor: { agentUserId, agentAuthnUserId },
      }),
  });
}

/**
 * Canonical atomic admission entry point. Callers must revalidate every
 * eligibility and admission rule in validateAdmission; roster decisions bypass
 * only rules that the caller deliberately omits from that validation. The
 * fixed source establishes the identity context, including an exact LTI
 * identity; selectSource may choose the authoritative source from the resulting
 * locked classification.
 */
export async function admitUserToCourseInstance({
  userId,
  courseInstanceId,
  expectedInvitationEnrollmentId,
  source,
  selectSource,
  validateAdmission,
  agentUserId,
  agentAuthnUserId,
}: CheckedEnrollmentAdmissionInput): Promise<Enrollment> {
  const immutableSource = Object.freeze({ ...source }) as EnrollmentAdmissionSource;
  const lti13Identity =
    immutableSource.type === 'lti13'
      ? {
          lti13CourseInstanceId: immutableSource.lti13CourseInstanceId,
          sub: immutableSource.sub,
        }
      : undefined;
  const context = { userId, courseInstanceId, lti13Identity };
  return await runWithEnrollmentIdentityRetry({
    context,
    attempt: async () =>
      await executeCheckedAdmissionAttempt({
        context,
        expectedInvitationEnrollmentId,
        source: immutableSource,
        selectSource,
        validateAdmission,
        actor: { agentUserId, agentAuthnUserId },
      }),
  });
}

/**
 * Convenience wrapper for invitation admission. The mandatory validation seam
 * delegates unchanged to the canonical checked path.
 */
export async function admitUserFromEnrollmentInvitation(
  input: Omit<CheckedEnrollmentAdmissionInput, 'selectSource' | 'source'> & {
    source: EnrollmentInvitationAdmissionSource;
  },
): Promise<Enrollment> {
  return await admitUserToCourseInstance(input);
}

/**
 * Rejects only the exact actionable conventional invitation selected by the
 * caller. Roster provenance cannot authorize this mutation.
 */
export async function rejectConventionalEnrollmentInvitation({
  agentAuthnUserId,
  agentUserId,
  courseInstanceId,
  enrollmentId,
  userId,
}: EnrollmentAuditActor & {
  courseInstanceId: string;
  enrollmentId: string;
  userId: string;
}): Promise<Enrollment> {
  return await runWithSharedEnrollmentBarrier(courseInstanceId, async () => {
    const { decision } = await selectLockedEnrollmentIdentityDecision(
      { courseInstanceId, userId },
      { type: 'pending_uid' },
      undefined,
      {
        expectedInvitationEnrollmentId: enrollmentId,
      },
    );
    if (!decision.allowed) {
      throwAdmissionDenied(decision);
    }
    if (decision.invitationCandidate === null) {
      throw new Error('Conventional invitation decision has no candidate');
    }

    const oldEnrollment = decision.invitationCandidate.enrollment;
    const enrollment = await queryRow(
      sql.reject_conventional_invitation,
      { enrollment_id: oldEnrollment.id },
      EnrollmentSchema,
    );
    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'update',
      actionDetail: 'invitation_rejected',
      rowId: enrollment.id,
      oldRow: oldEnrollment,
      newRow: enrollment,
      agentAuthnUserId,
      agentUserId,
    });
    return enrollment;
  });
}
