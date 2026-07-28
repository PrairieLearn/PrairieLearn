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
} from '../lib/enrollment-eligibility.js';
import { isEnterprise } from '../lib/license.js';
import { HttpRedirect } from '../lib/redirect.js';

import {
  type EnrollmentAdmissionSource,
  type EnrollmentIdentityClassification,
  selectEnrollmentIdentityClassification,
} from './enrollment-identity.js';
import {
  EnrollmentInvitationRequiredError,
  admitUserToCourseInstance,
} from './enrollment-reconciliation.js';
import { selectUserById } from './user.js';

interface AlreadyJoinedAdmissionPlan {
  readonly type: 'already_joined';
}

interface BlockedAdmissionPlan {
  readonly type: 'blocked';
}

interface ConventionalInvitationAdmissionPlan {
  readonly source: Extract<EnrollmentAdmissionSource, { type: 'pending_uid' }>;
  readonly type: 'conventional_invitation';
}

interface InstitutionRosterInvitationAdmissionPlan {
  readonly source: Extract<EnrollmentAdmissionSource, { type: 'institution_uin' }>;
  readonly type: 'institution_roster_invitation';
}

interface SelfEnrollmentAdmissionPlan {
  readonly enrollmentCodeValidated: boolean;
  readonly source: Extract<EnrollmentAdmissionSource, { type: 'ordinary' }>;
  readonly type: 'self_enrollment';
}

interface EnrollmentCodeRequiredAdmissionPlan {
  readonly type: 'enrollment_code_required';
}

interface IneligibleAdmissionPlan {
  readonly reason: EnrollmentIneligibilityReason;
  readonly type: 'ineligible';
}

export type CourseInstanceAdmissionPlan =
  | AlreadyJoinedAdmissionPlan
  | BlockedAdmissionPlan
  | ConventionalInvitationAdmissionPlan
  | InstitutionRosterInvitationAdmissionPlan
  | SelfEnrollmentAdmissionPlan
  | EnrollmentCodeRequiredAdmissionPlan
  | IneligibleAdmissionPlan;

export interface CourseInstanceAdmissionPlanLocals {
  course_instance_admission_plan?: CourseInstanceAdmissionPlan;
}

export type ActionableCourseInstanceAdmissionPlan =
  | ConventionalInvitationAdmissionPlan
  | InstitutionRosterInvitationAdmissionPlan
  | SelfEnrollmentAdmissionPlan;

export class CourseInstanceAdmissionEligibilityError extends Error {
  readonly reason: EnrollmentIneligibilityReason;

  constructor(reason: EnrollmentIneligibilityReason) {
    super(`Course instance admission is ineligible: ${reason}`);
    this.name = 'CourseInstanceAdmissionEligibilityError';
    this.reason = reason;
  }
}

export class CourseInstanceEnrollmentCodeRequiredError extends Error {
  constructor() {
    super('A valid enrollment code is required');
    this.name = 'CourseInstanceEnrollmentCodeRequiredError';
  }
}

export class CourseInstanceAdmissionPlanChangedError extends Error {
  readonly plan: CourseInstanceAdmissionPlan;

  constructor(plan: CourseInstanceAdmissionPlan) {
    super(`Course instance admission plan changed to ${plan.type}`);
    this.name = 'CourseInstanceAdmissionPlanChangedError';
    this.plan = plan;
  }
}

function enrollmentCodeMatches(
  courseInstance: CourseInstance,
  enrollmentCode: string | undefined,
): boolean {
  return enrollmentCode?.toUpperCase() === courseInstance.enrollment_code.toUpperCase();
}

function getCourseInstanceAdmissionPlan({
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
}): CourseInstanceAdmissionPlan {
  if (classification.kind === 'joined') {
    return { type: 'already_joined' };
  }
  if (classification.kind === 'blocked') {
    return { type: 'blocked' };
  }
  if (classification.actionableInstitutionRosterInvitationCandidates.length > 0) {
    return {
      source: { type: 'institution_uin' },
      type: 'institution_roster_invitation',
    };
  }
  if (classification.actionableConventionalInvitationCandidates.length > 0) {
    return {
      source: { type: 'pending_uid' },
      type: 'conventional_invitation',
    };
  }

  const eligibility = checkEnrollmentEligibility({
    user,
    course,
    courseInstance,
    // Only an actionable invitation can bypass ordinary self-enrollment rules.
    existingEnrollment: null,
  });
  if (!eligibility.eligible) {
    return { reason: eligibility.reason, type: 'ineligible' };
  }

  const enrollmentCodeValidated = enrollmentCodeMatches(courseInstance, enrollmentCode);
  if (courseInstance.self_enrollment_use_enrollment_code && !enrollmentCodeValidated) {
    return { type: 'enrollment_code_required' };
  }

  return {
    enrollmentCodeValidated,
    source: { type: 'ordinary' },
    type: 'self_enrollment',
  };
}

function isActionableCourseInstanceAdmissionPlan(
  plan: CourseInstanceAdmissionPlan,
): plan is ActionableCourseInstanceAdmissionPlan {
  return (
    plan.type === 'conventional_invitation' ||
    plan.type === 'institution_roster_invitation' ||
    plan.type === 'self_enrollment'
  );
}

export async function selectCourseInstanceAdmissionPlan({
  course,
  courseInstance,
  enrollmentCode,
  user,
}: {
  course: Course;
  courseInstance: CourseInstance;
  enrollmentCode?: string;
  user: User;
}): Promise<CourseInstanceAdmissionPlan> {
  const classification = await selectEnrollmentIdentityClassification({
    courseInstanceId: courseInstance.id,
    userId: user.id,
  });
  return getCourseInstanceAdmissionPlan({
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
}: {
  authzData: Parameters<typeof checkPotentialEnterpriseEnrollment>[0]['authzData'];
  course: Course;
  courseInstance: CourseInstance;
  institution: Parameters<typeof checkPotentialEnterpriseEnrollment>[0]['institution'];
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
      throw new HttpRedirect(`/pl/course_instance/${courseInstance.id}/upgrade`);
    case PotentialEnrollmentStatus.LIMIT_EXCEEDED:
      throw new HttpRedirect('/pl/enroll/limit_exceeded');
    case PotentialEnrollmentStatus.ALLOWED:
      return;
    default:
      assertNever(status);
  }
}

export async function admitUserWithCourseInstanceAdmissionPlan({
  courseInstanceId,
  enrollmentCode,
  ip,
  isAdministrator,
  plan,
  reqDate,
  userId,
}: {
  courseInstanceId: string;
  enrollmentCode?: string;
  ip: string | null;
  isAdministrator: boolean;
  plan: ActionableCourseInstanceAdmissionPlan;
  reqDate: Date;
  userId: string;
}) {
  async function selectFreshPlan() {
    const user = await selectUserById(userId);
    const { authzData, course, courseInstance } = await constructCourseOrInstanceContext({
      course_id: null,
      course_instance_id: courseInstanceId,
      ip,
      is_administrator: isAdministrator,
      req_date: reqDate,
      user,
    });
    if (authzData === null || courseInstance === null) {
      throw new HttpStatusError(403, 'Access denied');
    }
    return await selectCourseInstanceAdmissionPlan({
      course,
      courseInstance,
      enrollmentCode,
      user,
    });
  }

  let currentPlan = plan;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await admitUserToCourseInstance({
        agentAuthnUserId: userId,
        agentUserId: userId,
        courseInstanceId,
        source: currentPlan.source,
        userId,
        validateAdmission: async ({ source }) => {
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
            authzData.course_instance_role !== 'None'
          ) {
            throw new HttpStatusError(403, 'Access denied');
          }

          if (source.type === 'ordinary') {
            const eligibility = checkEnrollmentEligibility({
              user,
              course,
              courseInstance,
              existingEnrollment: null,
            });
            if (!eligibility.eligible) {
              throw new CourseInstanceAdmissionEligibilityError(eligibility.reason);
            }
            if (
              courseInstance.self_enrollment_use_enrollment_code &&
              !enrollmentCodeMatches(courseInstance, enrollmentCode)
            ) {
              throw new CourseInstanceEnrollmentCodeRequiredError();
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
          });
        },
      });
    } catch (error) {
      if (!(error instanceof EnrollmentInvitationRequiredError)) {
        throw error;
      }
      const freshPlan = await selectFreshPlan();
      if (attempt === 1 && isActionableCourseInstanceAdmissionPlan(freshPlan)) {
        currentPlan = freshPlan;
        continue;
      }
      throw new CourseInstanceAdmissionPlanChangedError(freshPlan);
    }
  }

  throw new Error('Course instance admission exhausted its attempts');
}
