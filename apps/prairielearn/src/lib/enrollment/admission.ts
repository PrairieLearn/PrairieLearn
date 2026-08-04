import { HttpStatusError } from '@prairielearn/error';
import { assertNever } from '@prairielearn/utils';

import {
  PotentialEnrollmentStatus,
  checkPotentialEnterpriseEnrollment,
} from '../../ee/models/enrollment.js';
import { selectUserById } from '../../models/user.js';
import { hasRole, makePageAuthzData } from '../authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../authz-data.js';
import type { Course, CourseInstance, User } from '../db-types.js';
import { isEnterprise } from '../license.js';
import { HttpRedirect } from '../redirect.js';

import {
  type EnrollmentIneligibilityReason,
  checkEnrollmentEligibility,
  getEligibilityErrorMessage,
} from './eligibility.js';
import {
  type EnrollmentAdmissionSource,
  type EnrollmentIdentityClassification,
  selectEnrollmentIdentityClassification,
} from './identity.js';
import {
  type SelectableEnrollmentAdmissionSource,
  admitUserToCourseInstance,
} from './reconciliation.js';

export type EnrollmentAccessDecision =
  | {
      allowed: true;
      source: SelectableEnrollmentAdmissionSource;
    }
  | {
      allowed: false;
      reason: EnrollmentIneligibilityReason | 'already_joined' | 'enrollment_code_required';
    };

function getEnrollmentAdmissionSource(
  classification: EnrollmentIdentityClassification,
): SelectableEnrollmentAdmissionSource {
  // Prefer the institution-scoped identity when both invitation forms match.
  // UIN is authoritative only within the course's institution, while UID is
  // the fallback for invitations without that institution-scoped identity.
  if (classification.actionableInstitutionUinInvitation !== null) {
    return { type: 'invitation', matchedBy: 'institution_uin' };
  }
  if (classification.actionableUidInvitation !== null) {
    return { type: 'invitation', matchedBy: 'uid' };
  }
  return { type: 'self_enrollment' };
}

function enrollmentCodeMatches(
  courseInstance: CourseInstance,
  enrollmentCode: string | undefined,
): boolean {
  return enrollmentCode?.toUpperCase() === courseInstance.enrollment_code.toUpperCase();
}

function getEnrollmentAccessDecision({
  classification,
  course,
  courseInstance,
  enrollmentCode,
  user,
}: {
  classification: EnrollmentIdentityClassification;
  course: Course;
  courseInstance: CourseInstance;
  enrollmentCode?: string;
  user: User;
}): EnrollmentAccessDecision {
  const boundStatus = classification.boundCandidate?.enrollment.status;
  // An enrollment already bound to the user is authoritative: a pending
  // invitation cannot override either existing access or a block.
  if (boundStatus === 'joined') return { allowed: false, reason: 'already_joined' };
  if (boundStatus === 'blocked') return { allowed: false, reason: 'blocked' };

  const source = getEnrollmentAdmissionSource(classification);
  if (source.type !== 'self_enrollment') {
    // An actionable invitation supplies its own admission authority and is not
    // subject to self-enrollment settings, expiration, institution
    // restrictions, or codes.
    return { allowed: true, source };
  }

  // Other bound states, such as left or removed, do not grant admission. Treat
  // them as a fresh self-enrollment instead of allowing an old enrollment to
  // bypass current self-enrollment policy.
  const eligibility = checkEnrollmentEligibility({
    user,
    course,
    courseInstance,
    existingEnrollment: null,
  });
  if (!eligibility.eligible) return { allowed: false, reason: eligibility.reason };

  if (
    courseInstance.self_enrollment_use_enrollment_code &&
    !enrollmentCodeMatches(courseInstance, enrollmentCode)
  ) {
    return { allowed: false, reason: 'enrollment_code_required' };
  }

  return { allowed: true, source };
}

/**
 * Computes a read-only admission preflight for routing and rendering. The
 * result can become stale immediately and must not authorize a mutation;
 * admission functions reselect identity candidates and rerun policy validation
 * under enrollment locks. Exact LTI authority is request-local and must use
 * {@link admitUserFromLti13Launch} instead.
 */
export async function selectEnrollmentAccessDecision({
  course,
  courseInstance,
  enrollmentCode,
  user,
}: {
  course: Course;
  courseInstance: CourseInstance;
  enrollmentCode?: string;
  user: User;
}): Promise<EnrollmentAccessDecision> {
  const classification = await selectEnrollmentIdentityClassification({
    courseInstanceId: courseInstance.id,
    userId: user.id,
  });
  return getEnrollmentAccessDecision({
    classification,
    course,
    courseInstance,
    enrollmentCode,
    user,
  });
}

async function validateEnterpriseAdmission({
  authzData,
  course,
  courseInstance,
  institution,
  lti13Relaunch,
}: {
  authzData: Parameters<typeof checkPotentialEnterpriseEnrollment>[0]['authzData'];
  course: Course;
  courseInstance: CourseInstance;
  institution: Parameters<typeof checkPotentialEnterpriseEnrollment>[0]['institution'];
  lti13Relaunch: boolean;
}) {
  if (!isEnterprise()) return;

  const status = await checkPotentialEnterpriseEnrollment({
    authzData,
    course,
    courseInstance,
    institution,
  });
  switch (status) {
    case PotentialEnrollmentStatus.PLAN_GRANTS_REQUIRED:
      throw new HttpRedirect(
        `/pl/course_instance/${courseInstance.id}/upgrade${lti13Relaunch ? '?lti13_relaunch=1' : ''}`,
      );
    case PotentialEnrollmentStatus.LIMIT_EXCEEDED:
      throw new HttpRedirect('/pl/enroll/limit_exceeded');
    case PotentialEnrollmentStatus.ALLOWED:
      return;
    default:
      assertNever(status);
  }
}

/**
 * Creates the policy callback that reconciliation invokes after reselecting
 * identity candidates under their enrollment locks and before mutating them.
 * It rebuilds the course context and checks student access, source-specific
 * admission policy, and enterprise requirements against that locked identity
 * classification.
 */
function createAdmissionValidator({
  courseInstanceId,
  enrollmentCode,
  ip,
  isAdministrator,
  reqDate,
  userId,
}: {
  courseInstanceId: string;
  enrollmentCode?: string;
  ip: string | null;
  isAdministrator: boolean;
  reqDate: Date;
  userId: string;
}) {
  return async ({
    classification,
    source,
  }: {
    classification: EnrollmentIdentityClassification;
    source: EnrollmentAdmissionSource;
  }) => {
    const user = await selectUserById(userId);
    const { authzData, course, courseInstance, institution } =
      await constructCourseOrInstanceContext({
        course_id: null,
        course_instance_id: courseInstanceId,
        ip,
        is_administrator: isAdministrator,
        req_date: reqDate,
        user,
      });

    // Admission is self-service. `Student` requires student access and excludes
    // course-instance staff roles; the course-role check also excludes users
    // entering through course-level staff access.
    if (
      authzData === null ||
      courseInstance === null ||
      !hasRole(authzData, ['Student']) ||
      authzData.course_role !== 'None'
    ) {
      throw new HttpStatusError(403, 'Access denied');
    }

    // Reconciliation has already matched an exact LTI link and subject against
    // the locked invitation. Do not reinterpret that request-local authority as
    // an ordinary UIN, UID, or self-enrollment source. Other sources must still
    // pass the ordinary admission policy using the locked classification.
    if (!(source.type === 'invitation' && source.matchedBy === 'lti13')) {
      const decision = getEnrollmentAccessDecision({
        classification,
        user,
        course,
        courseInstance,
        enrollmentCode,
      });
      if (!decision.allowed) {
        if (decision.reason === 'enrollment_code_required') {
          throw new HttpRedirect(`/pl/course_instance/${courseInstance.id}/join`);
        }
        if (decision.reason === 'already_joined') {
          throw new Error('Joined enrollment reached admission validation');
        }
        throw new HttpStatusError(403, getEligibilityErrorMessage(decision.reason));
      }
    }

    // Invitation authority never bypasses plan grants or enrollment limits.
    await validateEnterpriseAdmission({
      authzData: makePageAuthzData({
        authzData,
        is_administrator: isAdministrator,
      }),
      course,
      courseInstance,
      institution,
      lti13Relaunch: source.type === 'invitation' && source.matchedBy === 'lti13',
    });
  };
}

/**
 * Performs self-service course entry for the authenticated user. `userId` is
 * both the enrollment subject and audit actor; this is not an on-behalf-of-user
 * API. The source is selected and policy is validated from the locked identity
 * classification inside reconciliation.
 */
export async function admitUserForCourseInstanceAccess({
  courseInstanceId,
  enrollmentCode,
  ip,
  isAdministrator,
  reqDate,
  userId,
}: {
  courseInstanceId: string;
  enrollmentCode?: string;
  ip: string | null;
  isAdministrator: boolean;
  reqDate: Date;
  userId: string;
}) {
  return await admitUserToCourseInstance({
    actor: {
      agentAuthnUserId: userId,
      agentUserId: userId,
    },
    courseInstanceId,
    selectSource: getEnrollmentAdmissionSource,
    userId,
    validateAdmission: createAdmissionValidator({
      courseInstanceId,
      enrollmentCode,
      ip,
      isAdministrator,
      reqDate,
      userId,
    }),
  });
}

/**
 * Performs self-service admission from a fresh, verified LTI launch. The link
 * and subject are revalidated against locked candidates, while
 * `expectedInvitationEnrollmentId` prevents admission from silently falling
 * back to a different matching invitation. `userId` is both the enrollment
 * subject and audit actor.
 */
export async function admitUserFromLti13Launch({
  courseInstanceId,
  expectedInvitationEnrollmentId,
  ip,
  isAdministrator,
  lti13CourseInstanceId,
  reqDate,
  sub,
  userId,
}: {
  courseInstanceId: string;
  expectedInvitationEnrollmentId: string;
  ip: string | null;
  isAdministrator: boolean;
  lti13CourseInstanceId: string;
  reqDate: Date;
  sub: string;
  userId: string;
}) {
  return await admitUserToCourseInstance({
    actor: {
      agentAuthnUserId: userId,
      agentUserId: userId,
    },
    courseInstanceId,
    expectedInvitationEnrollmentId,
    source: {
      type: 'invitation',
      matchedBy: 'lti13',
      lti13CourseInstanceId,
      sub,
    },
    userId,
    validateAdmission: createAdmissionValidator({
      courseInstanceId,
      ip,
      isAdministrator,
      reqDate,
      userId,
    }),
  });
}
