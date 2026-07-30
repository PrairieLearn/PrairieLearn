import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

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
  readonly actionableConventionalInvitation: EnrollmentIdentityCandidate | null;
  readonly actionableInstitutionRosterInvitation: EnrollmentIdentityCandidate | null;
  readonly boundCandidate: EnrollmentIdentityCandidate | null;
  readonly candidates: readonly EnrollmentIdentityCandidate[];
}

export type EnrollmentAdmissionSource =
  | { readonly type: 'ordinary' }
  | { readonly type: 'pending_uid' }
  | { readonly type: 'institution_uin' }
  | {
      readonly type: 'lti13';
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
 * Roster identity can revive a non-guest `left` enrollment, but it cannot
 * override other bound states. Any guest candidate disables roster admission:
 * guest status is sticky when candidates are reconciled, so admitting through
 * a non-guest roster row would otherwise turn guest history into authority.
 */
function allowsRosterAdmission(
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

  // Conventional invitations are intentionally narrower than roster
  // invitations. They require no bound enrollment and cannot consume a row
  // carrying LTI provenance; exact LTI authority is checked separately.
  const actionableConventionalInvitation =
    boundCandidate === null
      ? (candidates.find(
          (candidate) =>
            isPendingInvitation(candidate) &&
            candidate.matches.pendingUid &&
            candidate.enrollment.pending_lti13_course_instance_id === null,
        ) ?? null)
      : null;
  const actionableInstitutionRosterInvitation = allowsRosterAdmission(candidates, boundCandidate)
    ? (candidates.find(
        (candidate) =>
          isPendingInvitation(candidate) &&
          !candidate.enrollment.is_guest &&
          candidate.matches.institutionUin,
      ) ?? null)
    : null;

  return {
    actionableConventionalInvitation,
    actionableInstitutionRosterInvitation,
    boundCandidate,
    candidates,
  };
}

function matchesAdmissionSource(
  candidate: EnrollmentIdentityCandidate,
  source: Exclude<EnrollmentAdmissionSource, { type: 'ordinary' }>,
): boolean {
  if (source.type === 'pending_uid') {
    return (
      candidate.matches.pendingUid && candidate.enrollment.pending_lti13_course_instance_id === null
    );
  }
  if (source.type === 'institution_uin') return candidate.matches.institutionUin;
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
  // paired with roster authority.
  const boundStatus = classification.boundCandidate?.enrollment.status;
  if (boundStatus === 'blocked') return { allowed: false, reason: 'blocked', source };
  if (boundStatus === 'joined') return { allowed: false, reason: 'already_joined', source };
  if (source.type === 'ordinary') {
    return { allowed: true, invitationCandidate: null, source };
  }

  const invitationCandidate =
    source.type === 'pending_uid'
      ? classification.actionableConventionalInvitation
      : source.type === 'institution_uin'
        ? classification.actionableInstitutionRosterInvitation
        : allowsRosterAdmission(classification.candidates, classification.boundCandidate)
          ? (classification.candidates.find(
              (candidate) =>
                isPendingInvitation(candidate) &&
                !candidate.enrollment.is_guest &&
                matchesAdmissionSource(candidate, source),
            ) ?? null)
          : null;
  if (invitationCandidate !== null) {
    return { allowed: true, invitationCandidate, source };
  }

  if (!classification.candidates.some((candidate) => matchesAdmissionSource(candidate, source))) {
    return { allowed: false, reason: 'no_matching_invitation', source };
  }
  if (
    source.type !== 'pending_uid' &&
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
