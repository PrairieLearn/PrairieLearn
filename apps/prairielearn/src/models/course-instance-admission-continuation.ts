import {
  type Lti13AdmissionContinuation,
  type OrdinaryAdmissionContinuation,
  clearCourseInstanceAdmissionContinuation,
  getCourseInstanceAdmissionContinuation,
  replaceLti13ContinuationWithOrdinary,
} from '../lib/course-instance-admission-continuation.js';
import type { Course, CourseInstance, Enrollment, User } from '../lib/db-types.js';
import { HttpRedirect } from '../lib/redirect.js';

import {
  type ActionableCourseInstanceAdmissionPlan,
  CourseInstanceAdmissionEligibilityError,
  type CourseInstanceAdmissionPlan,
  CourseInstanceEnrollmentCodeRequiredError,
  type Lti13RosterInvitationAdmissionPlan,
  admitUserFromLti13RosterInvitation,
  admitUserFromOrdinarySelfEnrollment,
  admitUserWithCourseInstanceAdmissionPlan,
  selectCourseInstanceAdmissionPlan,
  selectOrdinaryCourseInstanceAdmissionPlan,
} from './course-instance-admission.js';
import { selectEnrollmentAdmissionDecision } from './enrollment-identity.js';
import {
  EnrollmentAdmissionBlockedError,
  EnrollmentInvitationRequiredError,
} from './enrollment-reconciliation.js';

type SessionData = Record<string, unknown>;

export type CourseInstanceAdmissionSelection =
  | {
      plan: CourseInstanceAdmissionPlan;
      type: 'dynamic';
    }
  | {
      continuation: OrdinaryAdmissionContinuation;
      plan: CourseInstanceAdmissionPlan;
      type: 'ordinary';
    }
  | {
      continuation: Lti13AdmissionContinuation;
      plan: Lti13RosterInvitationAdmissionPlan;
      type: 'lti13';
    };

export interface CourseInstanceAdmissionSelectionLocals {
  course_instance_admission_selection?: CourseInstanceAdmissionSelection;
}

export type CourseInstanceAdmissionResult =
  | { enrollment: Enrollment; type: 'admitted' }
  | { type: 'blocked' }
  | { type: 'retry_ordinary' };

async function selectOrdinaryAdmission({
  continuation,
  course,
  courseInstance,
  enrollmentCode,
  user,
}: {
  continuation: OrdinaryAdmissionContinuation;
  course: Course;
  courseInstance: CourseInstance;
  enrollmentCode?: string;
  user: User;
}): Promise<CourseInstanceAdmissionSelection> {
  return {
    continuation,
    plan: await selectOrdinaryCourseInstanceAdmissionPlan({
      course,
      courseInstance,
      enrollmentCode,
      user,
    }),
    type: 'ordinary',
  };
}

export async function selectCourseInstanceAdmissionForRequest({
  course,
  courseInstance,
  enrollmentCode,
  session,
  user,
}: {
  course: Course;
  courseInstance: CourseInstance;
  enrollmentCode?: string;
  session: SessionData;
  user: User;
}): Promise<CourseInstanceAdmissionSelection> {
  const continuation = getCourseInstanceAdmissionContinuation({
    courseInstanceId: courseInstance.id,
    session,
    userId: user.id,
  });
  if (continuation === null) {
    return {
      plan: await selectCourseInstanceAdmissionPlan({
        course,
        courseInstance,
        enrollmentCode,
        user,
      }),
      type: 'dynamic',
    };
  }
  if (continuation.type === 'ordinary') {
    const selection = await selectOrdinaryAdmission({
      continuation,
      course,
      courseInstance,
      enrollmentCode,
      user,
    });
    if (selection.plan.type === 'already_joined' || selection.plan.type === 'blocked') {
      clearCourseInstanceAdmissionContinuation(session);
    }
    return selection;
  }

  const source = {
    type: 'lti13' as const,
    lti13CourseInstanceId: continuation.lti13_course_instance_id,
    sub: continuation.sub,
  };
  const decision = await selectEnrollmentAdmissionDecision(
    {
      courseInstanceId: courseInstance.id,
      lti13Identity: {
        lti13CourseInstanceId: continuation.lti13_course_instance_id,
        sub: continuation.sub,
      },
      userId: user.id,
    },
    source,
  );
  if (decision.allowed) {
    return {
      continuation,
      plan: { source, type: 'lti13_roster_invitation' },
      type: 'lti13',
    };
  }
  if (decision.reason === 'already_joined') {
    clearCourseInstanceAdmissionContinuation(session);
    return { plan: { type: 'already_joined' }, type: 'dynamic' };
  }
  if (decision.reason === 'blocked') {
    clearCourseInstanceAdmissionContinuation(session);
    return { plan: { type: 'blocked' }, type: 'dynamic' };
  }

  return await selectOrdinaryAdmission({
    continuation: replaceLti13ContinuationWithOrdinary({ continuation, session }),
    course,
    courseInstance,
    enrollmentCode,
    user,
  });
}

function isActionableDynamicPlan(
  plan: CourseInstanceAdmissionPlan,
): plan is ActionableCourseInstanceAdmissionPlan {
  return (
    plan.type === 'conventional_invitation' ||
    plan.type === 'institution_roster_invitation' ||
    plan.type === 'self_enrollment'
  );
}

export async function admitUserWithCourseInstanceAdmissionSelection({
  courseInstanceId,
  enrollmentCode,
  ip,
  isAdministrator,
  reqDate,
  selection,
  session,
  userId,
}: {
  courseInstanceId: string;
  enrollmentCode?: string;
  ip: string | null;
  isAdministrator: boolean;
  reqDate: Date;
  selection: CourseInstanceAdmissionSelection;
  session: SessionData;
  userId: string;
}): Promise<CourseInstanceAdmissionResult> {
  if (selection.type === 'dynamic') {
    if (!isActionableDynamicPlan(selection.plan)) {
      throw new Error(`Admission plan ${selection.plan.type} is not actionable`);
    }
    try {
      return {
        enrollment: await admitUserWithCourseInstanceAdmissionPlan({
          courseInstanceId,
          enrollmentCode,
          ip,
          isAdministrator,
          plan: selection.plan,
          reqDate,
          userId,
        }),
        type: 'admitted',
      };
    } catch (error) {
      if (error instanceof EnrollmentAdmissionBlockedError) {
        return { type: 'blocked' };
      }
      throw error;
    }
  }

  if (selection.type === 'ordinary') {
    if (selection.plan.type !== 'self_enrollment') {
      throw new Error(`Pinned ordinary plan ${selection.plan.type} is not actionable`);
    }
    try {
      const enrollment = await admitUserFromOrdinarySelfEnrollment({
        courseInstanceId,
        enrollmentCode,
        ip,
        isAdministrator,
        reqDate,
        userId,
      });
      clearCourseInstanceAdmissionContinuation(session);
      return { enrollment, type: 'admitted' };
    } catch (error) {
      if (error instanceof EnrollmentAdmissionBlockedError) {
        clearCourseInstanceAdmissionContinuation(session);
        return { type: 'blocked' };
      }
      if (
        error instanceof CourseInstanceAdmissionEligibilityError ||
        error instanceof CourseInstanceEnrollmentCodeRequiredError ||
        (error instanceof HttpRedirect &&
          error.url === `/pl/course_instance/${courseInstanceId}/upgrade`)
      ) {
        throw error;
      }
      clearCourseInstanceAdmissionContinuation(session);
      throw error;
    }
  }

  try {
    const enrollment = await admitUserFromLti13RosterInvitation({
      courseInstanceId,
      ip,
      isAdministrator,
      lti13CourseInstanceId: selection.continuation.lti13_course_instance_id,
      reqDate,
      sub: selection.continuation.sub,
      userId,
    });
    clearCourseInstanceAdmissionContinuation(session);
    return { enrollment, type: 'admitted' };
  } catch (error) {
    if (error instanceof EnrollmentInvitationRequiredError) {
      replaceLti13ContinuationWithOrdinary({
        continuation: selection.continuation,
        session,
      });
      return { type: 'retry_ordinary' };
    }
    if (error instanceof EnrollmentAdmissionBlockedError) {
      clearCourseInstanceAdmissionContinuation(session);
      return { type: 'blocked' };
    }
    if (
      error instanceof HttpRedirect &&
      error.url === `/pl/course_instance/${courseInstanceId}/upgrade`
    ) {
      throw error;
    }
    clearCourseInstanceAdmissionContinuation(session);
    throw error;
  }
}
