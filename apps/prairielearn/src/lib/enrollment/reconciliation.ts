import assert from 'node:assert';

import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { insertAuditEvent } from '../../models/audit-event.js';
import { type Enrollment, EnrollmentSchema } from '../db-types.js';

import { runWithSharedEnrollmentBarrier } from './barrier.js';
import {
  type EnrollmentAdmissionDecision,
  type EnrollmentAdmissionSource,
  type EnrollmentIdentityCandidate,
  type EnrollmentIdentityClassification,
  type EnrollmentIdentityContext,
  getEnrollmentAdmissionDecision,
  selectEnrollmentIdentityClassification,
} from './identity.js';
import { lockEnrollments, normalizeEnrollmentIds } from './lock.js';

const sql = loadSqlEquiv(import.meta.url);

interface EnrollmentAuditActor {
  agentAuthnUserId: string | null;
  agentUserId: string | null;
}

/**
 * Sources that can be selected after the initial candidate query. Exact LTI
 * identity must participate in that query, so an LTI source must instead be
 * supplied explicitly with its link and subject.
 */
export type SelectableEnrollmentAdmissionSource = Exclude<
  EnrollmentAdmissionSource,
  { matchedBy: 'lti13' }
>;

type EnrollmentAdmissionSourceSelection =
  | { source: EnrollmentAdmissionSource }
  | {
      selectSource: (
        classification: EnrollmentIdentityClassification,
      ) => SelectableEnrollmentAdmissionSource;
    };

export class EnrollmentAdmissionDeniedError extends Error {
  constructor(readonly decision: Extract<EnrollmentAdmissionDecision, { allowed: false }>) {
    super(`Enrollment admission denied: ${decision.reason}`);
    this.name = 'EnrollmentAdmissionDeniedError';
  }
}

/**
 * Prefer the enrollment already bound to the user, then a sole guest
 * enrollment, and otherwise the lowest numeric ID. The deterministic fallback
 * also handles zero or multiple guest candidates; guest status itself is
 * merged separately with sticky OR semantics.
 */
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
  // Re-inviting an existing enrollment retains its join history, so multiple
  // pending and bound candidates may legitimately have first_joined_at values.
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

  // All dependent writers lock enrollment parents first, so the parent locks
  // held by reconciliation make these child sets quiescent. Reconciliation then
  // always mutates tables in this order: student labels, publishing extensions,
  // and assessment access controls. Labels and access-control references are
  // unioned; publishing extensions keep the latest end date. No new child rows
  // are inserted, avoiding locks on unrelated label, extension, or rule owners.
  await execute(sql.deduplicate_student_label_enrollments, params);
  await execute(sql.move_student_label_enrollments, params);
  await execute(sql.keep_best_publishing_extension_enrollment, params);
  await execute(sql.move_publishing_extension_enrollment, params);
  await execute(sql.deduplicate_assessment_access_control_enrollments, params);
  await execute(sql.move_assessment_access_control_enrollments, params);
}

function admissionActionDetail(
  source: EnrollmentAdmissionSource,
): 'implicit_joined' | 'invitation_accepted' {
  return source.type === 'self_enrollment' ? 'implicit_joined' : 'invitation_accepted';
}

function admissionAuditContext(
  reason: 'checked_admission' | 'identity_reconciliation',
  source: EnrollmentAdmissionSource,
) {
  return {
    reason,
    admission_source: source.type,
    ...(source.type === 'invitation' ? { invitation_match: source.matchedBy } : {}),
  };
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
    context: admissionAuditContext('identity_reconciliation', source),
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

/**
 * Performs checked admission and identity reconciliation in one transaction.
 *
 * The transaction takes the shared course-instance barrier, discovers identity
 * candidates without locking user or external-identity rows, locks the selected
 * enrollment parents in numeric order, and reselects only those locked rows.
 * Admission policy and caller validation therefore run against a stable
 * enrollment set before any mutation occurs.
 *
 * Reconciliation moves dependents to a deterministic survivor, deletes losers
 * before binding the survivor so pending unique keys are released, and records
 * every update/deletion in the same transaction. The survivor preserves the
 * earliest join time and sticky guest status across all candidates.
 *
 * A concurrent writer can still create or bind a matching enrollment outside
 * the locked candidate set. The database uniqueness constraints fail that rare
 * race atomically; this function does not retry inside the caller's transaction.
 */
export async function admitUserToCourseInstance(
  options: {
    actor: EnrollmentAuditActor;
    courseInstanceId: string;
    expectedInvitationEnrollmentId?: string;
    userId: string;
    validateAdmission: (context: { source: EnrollmentAdmissionSource }) => Promise<void>;
  } & EnrollmentAdmissionSourceSelection,
): Promise<Enrollment> {
  const { actor, userId, courseInstanceId, expectedInvitationEnrollmentId, validateAdmission } =
    options;
  const explicitSource = 'source' in options ? options.source : null;
  const context: EnrollmentIdentityContext = {
    userId,
    courseInstanceId,
    lti13Identity:
      explicitSource?.type === 'invitation' && explicitSource.matchedBy === 'lti13'
        ? {
            lti13CourseInstanceId: explicitSource.lti13CourseInstanceId,
            sub: explicitSource.sub,
          }
        : undefined,
  };

  return await runWithSharedEnrollmentBarrier(courseInstanceId, async () => {
    // Candidate IDs must be known before they can be locked. The second,
    // restricted selection is the authoritative classification for this
    // transaction; it cannot add an unlocked enrollment parent.
    const initialClassification = await selectEnrollmentIdentityClassification(context);
    const enrollmentIds = initialClassification.candidates.map(
      (candidate) => candidate.enrollment.id,
    );
    await lockEnrollments(enrollmentIds);
    const classification = await selectEnrollmentIdentityClassification(context, enrollmentIds);
    const selectedSource =
      'selectSource' in options ? options.selectSource(classification) : options.source;
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

    // Eligibility, limits, and source-specific policy are checked only after
    // identity authority has been revalidated under the enrollment locks.
    await validateAdmission({ source: decision.source });

    const survivorCandidate = selectSurvivor(
      classification.candidates,
      classification.boundCandidate,
    );
    // A concurrent writer can bind this user after candidate selection. Let the
    // unique constraint abort atomically; a later request will select the winner.
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
        context: admissionAuditContext('checked_admission', selectedSource),
        subjectUserId: enrollment.user_id,
        agentUserId: actor.agentUserId,
        agentAuthnUserId: actor.agentAuthnUserId,
      });
      return enrollment;
    }

    const candidateEnrollmentIds = classification.candidates.map(
      (candidate) => candidate.enrollment.id,
    );
    const loserCandidates = classification.candidates.filter(
      (candidate) => candidate.enrollment.id !== survivorCandidate.enrollment.id,
    );
    // Resolved enrollments cannot carry pending identity keys, the database
    // permits at most one enrollment bound to this user, and selectSurvivor
    // always chooses it. Fail closed before moving dependents if those
    // assumptions ever change: reconciliation must never delete a bound row.
    assert(
      loserCandidates.every((candidate) => candidate.enrollment.user_id === null),
      'Enrollment reconciliation cannot delete a bound enrollment',
    );
    const loserEnrollmentIds = loserCandidates.map((candidate) => candidate.enrollment.id);
    if (loserEnrollmentIds.length > 0) {
      await moveEnrollmentDependents(candidateEnrollmentIds, survivorCandidate.enrollment.id);
    }

    // A loser may own a pending unique key. Delete it before binding the survivor;
    // the transaction restores every mutation if the update loses a race.
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
        // Guest status is sticky and first_joined_at preserves the earliest
        // non-null value; the admitting SQL supplies now() only when none exists.
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
