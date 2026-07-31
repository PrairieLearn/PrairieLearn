import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { type Enrollment, EnrollmentSchema } from '../db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const EnrollmentIdentityCandidateRowSchema = z.object({
  enrollment: EnrollmentSchema,
  matches_bound_user: z.boolean(),
  matches_institution_uin: z.boolean(),
  matches_lti13: z.boolean(),
  matches_pending_uid: z.boolean(),
});

export interface EnrollmentIdentityContext {
  readonly courseInstanceId: string;
  readonly lti13Identity?: {
    readonly lti13CourseInstanceId: string;
    readonly sub: string;
  };
  readonly userId: string;
}

/**
 * An enrollment appears at most once in the candidate list, but can match more
 * than one identity key. Preserve that provenance: finding a row is not enough
 * to decide whether a particular admission source is allowed to use it.
 */
export interface EnrollmentIdentityCandidate {
  readonly enrollment: Enrollment;
  readonly matches: {
    readonly boundUser: boolean;
    readonly institutionUin: boolean;
    readonly lti13: boolean;
    readonly pendingUid: boolean;
  };
}

export interface EnrollmentIdentityClassification {
  /**
   * An unbound, non-guest enrollment in `invited` status, matched by
   * institution-scoped UIN and permitted by the candidates' bound and guest
   * state.
   */
  readonly actionableInstitutionUinInvitation: EnrollmentIdentityCandidate | null;
  /**
   * An unbound enrollment in `invited` status, matched by UID, provided no
   * enrollment is already bound to the user and the invitation does not carry
   * LTI provenance.
   */
  readonly actionableUidInvitation: EnrollmentIdentityCandidate | null;
  /** The candidate already bound to the user, if one exists. */
  readonly boundCandidate: EnrollmentIdentityCandidate | null;
  /**
   * Every distinct enrollment matched by the user binding or supplied identity
   * keys, including candidates that cannot authorize admission.
   */
  readonly candidates: readonly EnrollmentIdentityCandidate[];
}

export type EnrollmentAdmissionSource =
  | { readonly type: 'self_enrollment' }
  | {
      readonly type: 'invitation';
      readonly matchedBy: 'uid';
    }
  | {
      readonly type: 'invitation';
      readonly matchedBy: 'institution_uin';
    }
  | {
      readonly type: 'invitation';
      readonly matchedBy: 'lti13';
      readonly lti13CourseInstanceId: string;
      readonly sub: string;
    };

export type EnrollmentAdmissionDecision =
  | {
      readonly allowed: true;
      readonly invitationCandidate: EnrollmentIdentityCandidate | null;
      readonly source: EnrollmentAdmissionSource;
    }
  | {
      readonly allowed: false;
      readonly reason:
        | 'already_joined'
        | 'blocked'
        | 'guest_state'
        | 'no_matching_invitation'
        | 'non_actionable_bound_state';
      readonly source: EnrollmentAdmissionSource;
    };

function isPendingInvitation(candidate: EnrollmentIdentityCandidate): boolean {
  return candidate.enrollment.user_id === null && candidate.enrollment.status === 'invited';
}

/**
 * A UIN or exact LTI identity match can authorize a pending invitation when no
 * enrollment is bound to the user. It can also rejoin a user with a non-guest
 * `left` enrollment: reconciliation preserves the bound row, consumes the
 * pending invitation, and transitions the bound row to `joined`. Any other
 * bound status or any guest candidate disables this path, since guest status is
 * sticky when candidates are reconciled.
 */
function allowsUinOrLtiInvitation(
  candidates: readonly EnrollmentIdentityCandidate[],
  boundCandidate: EnrollmentIdentityCandidate | null,
): boolean {
  const boundEnrollment = boundCandidate?.enrollment;
  return (
    (boundEnrollment === undefined ||
      (boundEnrollment.status === 'left' && !boundEnrollment.is_guest)) &&
    !candidates.some((candidate) => candidate.enrollment.is_guest)
  );
}

function classifyEnrollmentIdentityCandidates(
  candidates: readonly EnrollmentIdentityCandidate[],
): EnrollmentIdentityClassification {
  const boundCandidate = candidates.find((candidate) => candidate.matches.boundUser) ?? null;

  // A UID match is intentionally narrower than a UIN or exact LTI match. It
  // requires no bound enrollment and cannot consume an invitation carrying LTI
  // identity; exact LTI authority is checked separately.
  const actionableUidInvitation =
    boundCandidate === null
      ? (candidates.find(
          (candidate) =>
            isPendingInvitation(candidate) &&
            candidate.matches.pendingUid &&
            candidate.enrollment.pending_lti13_course_instance_id === null,
        ) ?? null)
      : null;
  const actionableInstitutionUinInvitation = allowsUinOrLtiInvitation(candidates, boundCandidate)
    ? (candidates.find(
        (candidate) =>
          isPendingInvitation(candidate) &&
          !candidate.enrollment.is_guest &&
          candidate.matches.institutionUin,
      ) ?? null)
    : null;

  return {
    actionableInstitutionUinInvitation,
    actionableUidInvitation,
    boundCandidate,
    candidates,
  };
}

function matchesInvitationSource(
  candidate: EnrollmentIdentityCandidate,
  source: Exclude<EnrollmentAdmissionSource, { type: 'self_enrollment' }>,
): boolean {
  if (source.matchedBy === 'uid') {
    return (
      candidate.matches.pendingUid && candidate.enrollment.pending_lti13_course_instance_id === null
    );
  }
  if (source.matchedBy === 'institution_uin') return candidate.matches.institutionUin;
  return (
    candidate.matches.lti13 &&
    candidate.enrollment.pending_lti13_course_instance_id === source.lti13CourseInstanceId &&
    candidate.enrollment.pending_lti13_sub === source.sub
  );
}

export function getEnrollmentAdmissionDecision(
  classification: EnrollmentIdentityClassification,
  source: EnrollmentAdmissionSource,
): EnrollmentAdmissionDecision {
  // Bound joined/blocked state wins over every pending identity. Other bound
  // states remain relevant below: only a non-guest `left` enrollment can be
  // paired with a UIN- or LTI-matched invitation.
  const boundStatus = classification.boundCandidate?.enrollment.status;
  if (boundStatus === 'blocked') return { allowed: false, reason: 'blocked', source };
  if (boundStatus === 'joined') return { allowed: false, reason: 'already_joined', source };
  if (source.type === 'self_enrollment') {
    return { allowed: true, invitationCandidate: null, source };
  }

  const invitationCandidate = run(() => {
    if (source.matchedBy === 'uid') {
      return classification.actionableUidInvitation;
    }
    if (source.matchedBy === 'institution_uin') {
      return classification.actionableInstitutionUinInvitation;
    }
    if (!allowsUinOrLtiInvitation(classification.candidates, classification.boundCandidate)) {
      return null;
    }
    return (
      classification.candidates.find(
        (candidate) =>
          isPendingInvitation(candidate) &&
          !candidate.enrollment.is_guest &&
          matchesInvitationSource(candidate, source),
      ) ?? null
    );
  });
  if (invitationCandidate !== null) {
    return { allowed: true, invitationCandidate, source };
  }

  if (!classification.candidates.some((candidate) => matchesInvitationSource(candidate, source))) {
    return { allowed: false, reason: 'no_matching_invitation', source };
  }
  if (
    source.matchedBy !== 'uid' &&
    classification.candidates.some((candidate) => candidate.enrollment.is_guest)
  ) {
    return { allowed: false, reason: 'guest_state', source };
  }
  if (classification.boundCandidate !== null) {
    return { allowed: false, reason: 'non_actionable_bound_state', source };
  }
  return { allowed: false, reason: 'no_matching_invitation', source };
}

/**
 * Omitting `enrollmentIds` selects every identity candidate. Reconciliation
 * first discovers those IDs, locks the enrollment parents in numeric order, and
 * then restricts its second selection to the locked IDs. This prevents a newly
 * matching enrollment from expanding the lock set out of order.
 *
 * User and external-identity rows are deliberately not locked. If identity
 * data changes during the narrow selection-to-lock window, this attempt uses
 * only the locked candidates; a conflicting bind fails atomically on the
 * enrollment uniqueness constraints and a later request can retry.
 */
export async function selectEnrollmentIdentityClassification(
  context: EnrollmentIdentityContext,
  enrollmentIds?: string[],
): Promise<EnrollmentIdentityClassification> {
  if (enrollmentIds?.length === 0) return classifyEnrollmentIdentityCandidates([]);

  // The SQL performs one indexed lookup per identity key and unions the IDs
  // before fetching complete enrollment rows. This avoids scanning every
  // enrollment in a large course instance and deduplicates multi-key matches.
  const rows = await queryRows(
    sql.select_enrollment_identity_candidates,
    {
      course_instance_id: context.courseInstanceId,
      enrollment_ids: enrollmentIds ?? null,
      lti13_course_instance_id: context.lti13Identity?.lti13CourseInstanceId ?? null,
      lti13_sub: context.lti13Identity?.sub ?? null,
      user_id: context.userId,
    },
    EnrollmentIdentityCandidateRowSchema,
  );
  return classifyEnrollmentIdentityCandidates(
    rows.map((row) => ({
      enrollment: row.enrollment,
      matches: {
        boundUser: row.matches_bound_user,
        institutionUin: row.matches_institution_uin,
        lti13: row.matches_lti13,
        pendingUid: row.matches_pending_uid,
      },
    })),
  );
}

export async function selectEnrollmentAdmissionDecision(
  context: EnrollmentIdentityContext,
  source: EnrollmentAdmissionSource,
): Promise<EnrollmentAdmissionDecision> {
  return getEnrollmentAdmissionDecision(
    await selectEnrollmentIdentityClassification(context),
    source,
  );
}
