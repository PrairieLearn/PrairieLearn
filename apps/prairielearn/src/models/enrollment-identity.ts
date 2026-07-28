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
  readonly courseInstanceId: string;
  readonly lti13Identity?: {
    readonly lti13CourseInstanceId: string;
    readonly sub: string;
  };
  readonly userId: string;
}

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

async function selectEnrollmentIdentityCandidates(
  context: EnrollmentIdentityContext,
  enrollmentIds: string[] | null,
): Promise<EnrollmentIdentityCandidate[]> {
  if (enrollmentIds?.length === 0) return [];
  return mapCandidateRows(
    await queryRows(
      sql.select_enrollment_identity_candidates,
      identityQueryParams(context, enrollmentIds),
      EnrollmentIdentityCandidateRowSchema,
    ),
  );
}

function isPendingInvitation(candidate: EnrollmentIdentityCandidate): boolean {
  return candidate.enrollment.user_id === null && candidate.enrollment.status === 'invited';
}

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

export async function selectEnrollmentIdentityClassification(
  context: EnrollmentIdentityContext,
): Promise<EnrollmentIdentityClassification> {
  return classifyEnrollmentIdentityCandidates(
    await selectEnrollmentIdentityCandidates(context, null),
  );
}

/** @internal Restricted re-selection for enrollment parents already locked by reconciliation. */
export async function selectEnrollmentIdentityClassificationForRevalidation(
  context: EnrollmentIdentityContext,
  enrollmentIds: string[],
): Promise<EnrollmentIdentityClassification> {
  return classifyEnrollmentIdentityCandidates(
    await selectEnrollmentIdentityCandidates(context, enrollmentIds),
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
