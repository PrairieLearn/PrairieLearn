import assert from 'node:assert';

import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

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
 * An enrollment appears at most once in the candidate list, but it may be found
 * by more than one lookup. Keep each match result so admission can require the
 * particular UID, UIN, or LTI match that its caller relies on.
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
   * An unbound, non-guest invitation whose pending UIN matches the user's UIN
   * in the course's institution. This is `null` when another matching
   * enrollment is bound to the user or marked as a guest.
   */
  readonly actionableInstitutionUinInvitation: EnrollmentIdentityCandidate | null;
  /**
   * An unbound invitation whose pending UID matches the user's UID. This is
   * `null` when the user already has a bound enrollment or the invitation also
   * records an LTI link and `sub`.
   */
  readonly actionableUidInvitation: EnrollmentIdentityCandidate | null;
  /** The candidate already bound to the user, if one exists. */
  readonly boundCandidate: EnrollmentIdentityCandidate | null;
  /**
   * Every distinct enrollment found by the bound user ID, pending UID,
   * institution-scoped UIN, or optional LTI link and `sub`, including rows that
   * cannot be used for admission.
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
 * A pending UIN invitation or an LTI invitation with the requested link and
 * `sub` can be admitted when no enrollment is bound to the user. It can also be
 * paired with a non-guest `left` enrollment: reconciliation keeps the bound
 * row, deletes the pending invitation, and changes the bound row to `joined`.
 * Other bound statuses and guest enrollments cannot use this path because guest
 * status is preserved when rows are merged.
 */
function allowsUinOrLtiInvitation(
  candidates: readonly EnrollmentIdentityCandidate[],
  boundCandidate: EnrollmentIdentityCandidate | null,
): boolean {
  if (candidates.some((candidate) => candidate.enrollment.is_guest)) return false;
  if (boundCandidate === null) return true;
  return boundCandidate.enrollment.status === 'left';
}

export function classifyEnrollmentIdentityCandidates(
  candidates: readonly EnrollmentIdentityCandidate[],
): EnrollmentIdentityClassification {
  const boundCandidates = candidates.filter((candidate) => candidate.matches.boundUser);
  assert(
    boundCandidates.length <= 1,
    'Multiple enrollments are bound to the same user in a course instance',
  );
  const boundCandidate = boundCandidates.at(0) ?? null;

  // A UID invitation cannot be paired with an existing bound enrollment. If
  // the invitation records an LTI link, the caller must match that link and
  // `sub` instead of relying on the UID alone.
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
  switch (source.matchedBy) {
    case 'uid':
      return (
        candidate.matches.pendingUid &&
        candidate.enrollment.pending_lti13_course_instance_id === null
      );
    case 'institution_uin':
      return candidate.matches.institutionUin;
    case 'lti13':
      return (
        candidate.matches.lti13 &&
        candidate.enrollment.pending_lti13_course_instance_id === source.lti13CourseInstanceId &&
        candidate.enrollment.pending_lti13_sub === source.sub
      );
    default:
      return assertNever(source);
  }
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
 * Omitting `enrollmentIds` returns every matching enrollment. Reconciliation
 * uses that first result to decide which rows to lock, then passes their IDs to
 * re-read only those locked rows. An enrollment that starts matching in between
 * cannot add another row to the lock set after locking has begun.
 *
 * User and LTI user rows are not locked. If a UID, UIN, or LTI association
 * changes between the two queries, this attempt continues with only the rows it
 * locked. The enrollment uniqueness constraints reject a duplicate user
 * binding, and the request can be retried.
 */
export async function selectEnrollmentIdentityClassification(
  context: EnrollmentIdentityContext,
  enrollmentIds?: string[],
): Promise<EnrollmentIdentityClassification> {
  if (enrollmentIds?.length === 0) return classifyEnrollmentIdentityCandidates([]);

  // The SQL performs one indexed lookup for each supplied value, unions the
  // enrollment IDs, and only then fetches the complete rows. This avoids a scan
  // of every enrollment in the course and returns a row only once when several
  // lookups find it.
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

export async function selectEnrollmentAdmissionDecision({
  courseInstanceId,
  source,
  userId,
}: {
  courseInstanceId: string;
  source: EnrollmentAdmissionSource;
  userId: string;
}): Promise<EnrollmentAdmissionDecision> {
  const lti13Identity =
    source.type === 'invitation' && source.matchedBy === 'lti13'
      ? {
          lti13CourseInstanceId: source.lti13CourseInstanceId,
          sub: source.sub,
        }
      : undefined;
  return getEnrollmentAdmissionDecision(
    await selectEnrollmentIdentityClassification({ courseInstanceId, lti13Identity, userId }),
    source,
  );
}
