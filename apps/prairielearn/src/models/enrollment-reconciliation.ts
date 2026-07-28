import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { type Enrollment, EnrollmentSchema } from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';
import { runWithSharedEnrollmentBarrier } from './enrollment-barrier.js';
import {
  type EnrollmentAdmissionDecision,
  type EnrollmentAdmissionSource,
  type EnrollmentIdentityCandidate,
  type EnrollmentIdentityClassification,
  type EnrollmentIdentityContext,
  getEnrollmentAdmissionDecision,
  selectEnrollmentIdentityClassification,
  selectEnrollmentIdentityClassificationForRevalidation,
} from './enrollment-identity.js';
import { lockEnrollments, normalizeEnrollmentIds } from './enrollment-lock.js';

const sql = loadSqlEquiv(import.meta.url);

const ENROLLMENT_IDENTITY_UNIQUE_CONSTRAINTS = new Set([
  'enrollments_course_instance_id_pending_uin_key',
  'enrollments_pending_lti13_ciid_sub_course_instance_id_key',
  'enrollments_pending_uid_course_instance_id_key',
  'enrollments_user_id_course_instance_id_key',
]);

interface EnrollmentAuditActor {
  agentAuthnUserId: string | null;
  agentUserId: string | null;
}

export class EnrollmentAdmissionDeniedError extends Error {
  constructor(readonly decision: Extract<EnrollmentAdmissionDecision, { allowed: false }>) {
    super(`Enrollment admission denied: ${decision.reason}`);
    this.name = 'EnrollmentAdmissionDeniedError';
  }
}

function selectSurvivor(
  candidates: readonly EnrollmentIdentityCandidate[],
  boundCandidate: EnrollmentIdentityCandidate | null,
): EnrollmentIdentityCandidate | null {
  if (boundCandidate !== null) return boundCandidate;
  const guestCandidates = candidates.filter((candidate) => candidate.enrollment.is_guest);
  if (guestCandidates.length === 1) return guestCandidates[0];

  const [lowestId] = normalizeEnrollmentIds(candidates.map((candidate) => candidate.enrollment.id));
  return candidates.find((candidate) => candidate.enrollment.id === lowestId) ?? null;
}

function selectEarliestFirstJoinedAt(
  candidates: readonly EnrollmentIdentityCandidate[],
): Date | null {
  const joinedAt = candidates.flatMap((candidate) =>
    candidate.enrollment.first_joined_at === null ? [] : [candidate.enrollment.first_joined_at],
  );
  return joinedAt.length === 0
    ? null
    : new Date(Math.min(...joinedAt.map((date) => date.getTime())));
}

async function moveEnrollmentDependents(
  enrollmentIds: string[],
  survivorEnrollmentId: string,
): Promise<void> {
  const params = {
    enrollment_ids: enrollmentIds,
    survivor_enrollment_id: survivorEnrollmentId,
  };

  // Parent-first locking from enrollment-dependent writers makes the child rows
  // quiescent. Mutating each table in this order supplies the remaining lock order.
  await execute(sql.deduplicate_student_label_enrollments, params);
  await execute(sql.move_student_label_enrollments, params);
  await execute(sql.keep_best_publishing_extension_enrollment, params);
  await execute(sql.move_publishing_extension_enrollment, params);
  await execute(sql.deduplicate_assessment_access_control_enrollments, params);
  await execute(sql.move_assessment_access_control_enrollments, params);
}

function admissionActionDetail(source: EnrollmentAdmissionSource) {
  if (source.type === 'ordinary') return 'implicit_joined' as const;
  if (source.type === 'pending_uid') return 'invitation_accepted' as const;
  return 'roster_admitted' as const;
}

async function auditAdmission({
  actor,
  source,
  oldSurvivor,
  newSurvivor,
  deletedEnrollments,
}: {
  actor: EnrollmentAuditActor;
  deletedEnrollments: Enrollment[];
  newSurvivor: Enrollment;
  oldSurvivor: Enrollment;
  source: EnrollmentAdmissionSource;
}): Promise<void> {
  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'update',
    actionDetail: admissionActionDetail(source),
    rowId: newSurvivor.id,
    oldRow: oldSurvivor,
    newRow: newSurvivor,
    context: {
      reason: 'identity_reconciliation',
      admission_source: source.type,
    },
    subjectUserId: newSurvivor.user_id,
    agentUserId: actor.agentUserId,
    agentAuthnUserId: actor.agentAuthnUserId,
  });

  for (const deletedEnrollment of deletedEnrollments) {
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

function isEnrollmentIdentityUniquenessViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return (
    code === '23505' &&
    typeof constraint === 'string' &&
    ENROLLMENT_IDENTITY_UNIQUE_CONSTRAINTS.has(constraint)
  );
}

async function runAdmissionWithRetry<T>(
  courseInstanceId: string,
  attempt: () => Promise<T>,
): Promise<T> {
  return await runWithSharedEnrollmentBarrier(courseInstanceId, async () => {
    for (let attemptNumber = 0; attemptNumber < 2; attemptNumber++) {
      await execute(sql.create_enrollment_identity_reconciliation_savepoint);
      try {
        const result = await attempt();
        await execute(sql.release_enrollment_identity_reconciliation_savepoint);
        return result;
      } catch (error) {
        await execute(sql.rollback_enrollment_identity_reconciliation_savepoint);
        await execute(sql.release_enrollment_identity_reconciliation_savepoint);
        if (attemptNumber === 1 || !isEnrollmentIdentityUniquenessViolation(error)) throw error;
      }
    }
    throw new Error('Unreachable enrollment admission retry state');
  });
}

function lti13IdentityForSource(source: EnrollmentAdmissionSource) {
  return source.type === 'lti13'
    ? {
        lti13CourseInstanceId: source.lti13CourseInstanceId,
        sub: source.sub,
      }
    : undefined;
}

/**
 * Both callbacks can run twice after a uniqueness retry. `selectSource` must be pure;
 * `validateAdmission` must keep effects within the transaction and avoid external side effects.
 */
export async function admitUserToCourseInstance({
  userId,
  courseInstanceId,
  expectedInvitationEnrollmentId,
  selectSource,
  source,
  validateAdmission,
  agentUserId,
  agentAuthnUserId,
}: EnrollmentAuditActor & {
  courseInstanceId: string;
  expectedInvitationEnrollmentId?: string;
  selectSource?: (
    classification: EnrollmentIdentityClassification,
  ) => Exclude<EnrollmentAdmissionSource, { type: 'lti13' }>;
  source: EnrollmentAdmissionSource;
  userId: string;
  validateAdmission: (context: { source: EnrollmentAdmissionSource }) => Promise<void>;
}): Promise<Enrollment> {
  const context: EnrollmentIdentityContext = {
    userId,
    courseInstanceId,
    lti13Identity: lti13IdentityForSource(source),
  };
  const actor = { agentUserId, agentAuthnUserId };

  return await runAdmissionWithRetry(courseInstanceId, async () => {
    const initialClassification = await selectEnrollmentIdentityClassification(context);
    const enrollmentIds = initialClassification.candidates.map(
      (candidate) => candidate.enrollment.id,
    );
    await lockEnrollments(enrollmentIds);
    const classification = await selectEnrollmentIdentityClassificationForRevalidation(
      context,
      enrollmentIds,
    );
    const selectedSource = selectSource?.(classification) ?? source;
    const decision = getEnrollmentAdmissionDecision(classification, selectedSource);

    if (!decision.allowed) {
      if (decision.reason === 'already_joined' && classification.boundCandidate !== null) {
        return classification.boundCandidate.enrollment;
      }
      throw new EnrollmentAdmissionDeniedError(decision);
    }
    if (
      expectedInvitationEnrollmentId !== undefined &&
      decision.invitationCandidate?.enrollment.id !== expectedInvitationEnrollmentId
    ) {
      throw new EnrollmentAdmissionDeniedError({
        allowed: false,
        reason: 'no_matching_invitation',
        source: selectedSource,
      });
    }

    await validateAdmission({ source: decision.source });

    const survivorCandidate = selectSurvivor(
      classification.candidates,
      classification.boundCandidate,
    );
    if (survivorCandidate === null) {
      const enrollment = await queryRow(
        sql.insert_joined_enrollment,
        { course_instance_id: courseInstanceId, user_id: userId },
        EnrollmentSchema,
      );
      await insertAuditEvent({
        tableName: 'enrollments',
        action: 'insert',
        actionDetail: admissionActionDetail(selectedSource),
        rowId: enrollment.id,
        newRow: enrollment,
        context: {
          reason: 'checked_admission',
          admission_source: selectedSource.type,
        },
        subjectUserId: enrollment.user_id,
        agentUserId,
        agentAuthnUserId,
      });
      return enrollment;
    }

    const candidateEnrollmentIds = classification.candidates.map(
      (candidate) => candidate.enrollment.id,
    );
    const loserEnrollmentIds = candidateEnrollmentIds.filter(
      (enrollmentId) => enrollmentId !== survivorCandidate.enrollment.id,
    );
    if (loserEnrollmentIds.length > 0) {
      await moveEnrollmentDependents(candidateEnrollmentIds, survivorCandidate.enrollment.id);
    }

    // A loser may own a pending unique key. Delete it before binding the survivor;
    // the attempt savepoint restores every mutation if the update loses a race.
    const deletedEnrollments =
      loserEnrollmentIds.length === 0
        ? []
        : await queryRows(
            sql.delete_loser_enrollments,
            { loser_enrollment_ids: loserEnrollmentIds },
            EnrollmentSchema,
          );
    const enrollment = await queryRow(
      sql.admit_reconciled_enrollment,
      {
        enrollment_id: survivorCandidate.enrollment.id,
        first_joined_at: selectEarliestFirstJoinedAt(classification.candidates),
        is_guest: classification.candidates.some((candidate) => candidate.enrollment.is_guest),
        user_id: userId,
      },
      EnrollmentSchema,
    );
    await auditAdmission({
      actor,
      source: selectedSource,
      oldSurvivor: survivorCandidate.enrollment,
      newSurvivor: enrollment,
      deletedEnrollments,
    });
    return enrollment;
  });
}
