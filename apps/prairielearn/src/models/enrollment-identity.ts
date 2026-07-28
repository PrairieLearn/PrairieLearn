import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type Enrollment, EnrollmentSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const EnrollmentIdentityCandidateRowSchema = z.object({
  enrollment: EnrollmentSchema,
  matches_bound_user: z.boolean(),
  matches_institution_uin: z.boolean(),
  matches_lti13: z.boolean(),
  matches_pending_uid: z.boolean(),
});

export interface EnrollmentIdentityContext {
  courseInstanceId: string;
  lti13Identity?: {
    lti13CourseInstanceId: string;
    sub: string;
  };
  userId: string;
}

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

export type EnrollmentAdmissionSource =
  | { type: 'ordinary' }
  | { type: 'pending_uid' }
  | { type: 'institution_uin' }
  | {
      type: 'lti13';
      lti13CourseInstanceId: string;
      sub: string;
    };

export type EnrollmentInvitationAdmissionSource = Exclude<
  EnrollmentAdmissionSource,
  { type: 'ordinary' }
>;

export type EnrollmentAdmissionDenialReason =
  | 'already_joined'
  | 'blocked'
  | 'guest_state'
  | 'no_matching_invitation'
  | 'non_actionable_bound_state';

export type EnrollmentAdmissionDecision =
  | {
      allowed: true;
      invitationCandidate: null;
      source: Extract<EnrollmentAdmissionSource, { type: 'ordinary' }>;
    }
  | {
      allowed: true;
      invitationCandidate: EnrollmentIdentityCandidate;
      source: EnrollmentInvitationAdmissionSource;
    }
  | {
      allowed: false;
      reason: EnrollmentAdmissionDenialReason;
      source: EnrollmentAdmissionSource;
    };

function identityQueryParams(
  { courseInstanceId, userId, lti13Identity }: EnrollmentIdentityContext,
  enrollmentIds: string[] | null,
) {
  return {
    course_instance_id: courseInstanceId,
    enrollment_ids: enrollmentIds,
    lti13_course_instance_id: lti13Identity?.lti13CourseInstanceId ?? null,
    lti13_sub: lti13Identity?.sub ?? null,
    user_id: userId,
  };
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

/**
 * Selects all enrollment rows matching the current bound-user, pending-UID,
 * institution-scoped UIN, or optional exact LTI identity. The query is strictly
 * read-only and returns one candidate per enrollment with every matching source
 * preserved as provenance.
 *
 * User identity fields and LTI link ownership are intentionally not locked.
 * Passing enrollment IDs limits the result to parents already locked by a
 * transaction. A rare concurrent user/LTI identity change may therefore be
 * completed by a later reconciliation call.
 */
export async function selectEnrollmentIdentityCandidates(
  context: EnrollmentIdentityContext,
  { enrollmentIds = null }: { enrollmentIds?: string[] | null } = {},
): Promise<EnrollmentIdentityCandidate[]> {
  if (enrollmentIds?.length === 0) return [];
  const rows = await queryRows(
    sql.select_enrollment_identity_candidates,
    identityQueryParams(context, enrollmentIds),
    EnrollmentIdentityCandidateRowSchema,
  );
  return mapCandidateRows(rows);
}

function isPendingInvitation(candidate: EnrollmentIdentityCandidate): boolean {
  return candidate.enrollment.user_id === null && candidate.enrollment.status === 'invited';
}

/**
 * Keeps diagnostic provenance separate from actionable invitation sets.
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

function matchesAdmissionSource(
  candidate: EnrollmentIdentityCandidate,
  source: EnrollmentInvitationAdmissionSource,
): boolean {
  if (source.type === 'pending_uid') return candidate.matches.pendingUid;
  if (source.type === 'institution_uin') return candidate.matches.institutionUin;
  return (
    candidate.matches.lti13 &&
    candidate.enrollment.pending_lti13_course_instance_id === source.lti13CourseInstanceId &&
    candidate.enrollment.pending_lti13_sub === source.sub
  );
}

function sourceCandidates(
  classification: EnrollmentIdentityClassification,
  source: EnrollmentInvitationAdmissionSource,
  actionable: boolean,
): EnrollmentIdentityCandidate[] {
  if (source.type === 'pending_uid') {
    return actionable
      ? classification.actionableConventionalInvitationCandidates
      : classification.conventionalInvitationCandidates;
  }
  if (source.type === 'institution_uin') {
    return actionable
      ? classification.actionableInstitutionRosterInvitationCandidates
      : classification.institutionRosterInvitationCandidates;
  }
  const candidates = actionable
    ? classification.actionableLti13RosterInvitationCandidates
    : classification.lti13RosterInvitationCandidates;
  return candidates.filter((candidate) => matchesAdmissionSource(candidate, source));
}

/**
 * Produces the source-specific authorization decision used by render and
 * mutation consumers. In particular, independently actionable UIN provenance
 * cannot make a mismatched LTI source actionable.
 */
export function getEnrollmentAdmissionDecision(
  classification: EnrollmentIdentityClassification,
  source: EnrollmentAdmissionSource,
): EnrollmentAdmissionDecision {
  if (classification.kind === 'blocked') {
    return { allowed: false, reason: 'blocked', source };
  }
  if (classification.kind === 'joined') {
    return { allowed: false, reason: 'already_joined', source };
  }
  if (source.type === 'ordinary') {
    return { allowed: true, invitationCandidate: null, source };
  }

  const actionableCandidates = sourceCandidates(classification, source, true);
  if (actionableCandidates.length > 0) {
    return {
      allowed: true,
      invitationCandidate: actionableCandidates[0],
      source,
    };
  }

  const hasSourceProvenance = classification.candidates.some((candidate) =>
    matchesAdmissionSource(candidate, source),
  );
  if (!hasSourceProvenance) {
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
