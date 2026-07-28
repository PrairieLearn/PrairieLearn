import { HttpStatusError } from '@prairielearn/error';
import { assertNever } from '@prairielearn/utils';

import {
  PotentialEnrollmentStatus,
  checkPotentialEnterpriseEnrollment,
} from '../ee/models/enrollment.js';
import { hasRole, makePageAuthzData } from '../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../lib/authz-data.js';
import type { Course, CourseInstance, User } from '../lib/db-types.js';
import {
  type EnrollmentIneligibilityReason,
  checkEnrollmentEligibility,
  getEligibilityErrorMessage,
} from '../lib/enrollment-eligibility.js';
import { isEnterprise } from '../lib/license.js';
import { HttpRedirect } from '../lib/redirect.js';

import {
  type EnrollmentAdmissionSource,
  type EnrollmentIdentityClassification,
  selectEnrollmentIdentityClassification,
} from './enrollment-identity.js';
import { admitUserToCourseInstance } from './enrollment-reconciliation.js';
import { selectUserById } from './user.js';

type OrdinaryAdmissionSource = Exclude<EnrollmentAdmissionSource, { type: 'lti13' }>;

export type OrdinaryCourseInstanceAdmissionDecision =
  | {
      allowed: true;
      source: OrdinaryAdmissionSource;
    }
  | {
      allowed: false;
      reason: EnrollmentIneligibilityReason | 'already_joined' | 'enrollment_code_required';
    };

export interface OrdinaryCourseInstanceAdmissionLocals {
  ordinary_course_instance_admission_decision?: OrdinaryCourseInstanceAdmissionDecision;
}

function getOrdinaryAdmissionSource(
  classification: EnrollmentIdentityClassification,
): OrdinaryAdmissionSource {
  if (classification.actionableInstitutionRosterInvitation !== null) {
    return { type: 'institution_uin' };
  }
  if (classification.actionableConventionalInvitation !== null) {
    return { type: 'pending_uid' };
  }
  return { type: 'ordinary' };
}

function enrollmentCodeMatches(
  courseInstance: CourseInstance,
  enrollmentCode: string | undefined,
): boolean {
  return enrollmentCode?.toUpperCase() === courseInstance.enrollment_code.toUpperCase();
}

function getOrdinaryCourseInstanceAdmissionDecision({
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
}): OrdinaryCourseInstanceAdmissionDecision {
  const boundStatus = classification.boundCandidate?.enrollment.status;
  if (boundStatus === 'joined') return { allowed: false, reason: 'already_joined' };
  if (boundStatus === 'blocked') return { allowed: false, reason: 'blocked' };

  const source = getOrdinaryAdmissionSource(classification);
  if (source.type !== 'ordinary') {
    return { allowed: true, source };
  }

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

export async function selectOrdinaryCourseInstanceAdmissionDecision({
  course,
  courseInstance,
  enrollmentCode,
  user,
}: {
  course: Course;
  courseInstance: CourseInstance;
  enrollmentCode?: string;
  user: User;
}): Promise<OrdinaryCourseInstanceAdmissionDecision> {
  const classification = await selectEnrollmentIdentityClassification({
    courseInstanceId: courseInstance.id,
    userId: user.id,
  });
  return getOrdinaryCourseInstanceAdmissionDecision({
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

    if (
      authzData === null ||
      courseInstance === null ||
      !hasRole(authzData, ['Student']) ||
      authzData.course_role !== 'None' ||
      authzData.course_instance_role !== 'None' ||
      !authzData.has_student_access
    ) {
      throw new HttpStatusError(403, 'Access denied');
    }

    if (source.type !== 'lti13') {
      const decision = getOrdinaryCourseInstanceAdmissionDecision({
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
      if (decision.source.type !== source.type) {
        throw new Error('Locked ordinary admission source changed during validation');
      }
    }

    await validateEnterpriseAdmission({
      authzData: makePageAuthzData({
        authzData,
        is_administrator: isAdministrator,
      }),
      course,
      courseInstance,
      institution,
      lti13Relaunch: source.type === 'lti13',
    });
  };
}

export async function admitUserFromOrdinaryCourseInstanceRequest({
  courseInstanceId,
  decision,
  enrollmentCode,
  ip,
  isAdministrator,
  reqDate,
  userId,
}: {
  courseInstanceId: string;
  decision: Extract<OrdinaryCourseInstanceAdmissionDecision, { allowed: true }>;
  enrollmentCode?: string;
  ip: string | null;
  isAdministrator: boolean;
  reqDate: Date;
  userId: string;
}) {
  return await admitUserToCourseInstance({
    agentAuthnUserId: userId,
    agentUserId: userId,
    courseInstanceId,
    selectSource: getOrdinaryAdmissionSource,
    source: decision.source,
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

export async function admitUserFromLti13CourseInstanceRequest({
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
  const source = {
    type: 'lti13' as const,
    lti13CourseInstanceId,
    sub,
  };
  return await admitUserToCourseInstance({
    agentAuthnUserId: userId,
    agentUserId: userId,
    courseInstanceId,
    expectedInvitationEnrollmentId,
    source,
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
