import type {
  Assessment,
  CourseInstance,
  EnumCourseInstanceRole,
  EnumCourseRole,
  EnumMode,
  SprocAuthzAssessment,
  SprocAuthzAssessmentInstance,
} from '../db-types.js';
import { getGroupId } from '../groups.js';
import { idsEqual } from '../id.js';

import {
  selectAccessControlRulesForAssessment,
  selectAccessControlRulesForCourseInstance,
  selectUserAccessContext,
} from './data.js';
import {
  type AccessControlResolverResult,
  formatDateShort,
  resolveAccessControl,
} from './resolver.js';

export interface AuthzDataForAccessControl {
  user: { id: string };
  mode: EnumMode;
  course_role: EnumCourseRole;
  course_instance_role: EnumCourseInstanceRole;
  has_course_instance_permission_view: boolean;
}

interface ModernAssessmentAccessInput {
  assessment: Assessment;
  userId: string;
  courseInstance: CourseInstance;
  authzData: AuthzDataForAccessControl;
  reqDate: Date;
}

function resolverResultToAuthzAssessment(
  result: AccessControlResolverResult,
  authzMode: EnumMode,
  displayTimezone: string,
): SprocAuthzAssessment {
  return {
    authorized: result.authorized,
    credit: result.credit,
    credit_date_string: result.creditDateString,
    time_limit_min: result.timeLimitMin,
    password: result.password,
    active: result.active,
    show_closed_assessment: result.showClosedAssessment,
    show_closed_assessment_score: result.showClosedAssessmentScore,
    exam_access_end: result.examAccessEnd,
    // Only report Exam mode when the student has an active PrairieTest
    // reservation (examAccessEnd is non-null), indicating a live exam session.
    mode: authzMode === 'Exam' && result.examAccessEnd ? 'Exam' : null,
    show_before_release: result.showBeforeRelease,
    next_active_time: result.nextActiveDate
      ? formatDateShort(result.nextActiveDate, displayTimezone)
      : null,
    access_rules: [],
    access_timeline: result.accessTimeline,
  };
}

export async function resolveModernAssessmentAccess({
  assessment,
  userId,
  courseInstance,
  authzData,
  reqDate,
}: ModernAssessmentAccessInput): Promise<SprocAuthzAssessment> {
  const [rules, { enrollment, prairieTestReservations }] = await Promise.all([
    selectAccessControlRulesForAssessment(assessment),
    selectUserAccessContext(userId, courseInstance, reqDate),
  ]);

  const result = resolveAccessControl({
    rules,
    enrollment,
    date: reqDate,
    displayTimezone: courseInstance.display_timezone,
    authzMode: authzData.mode,
    courseRole: authzData.course_role,
    courseInstanceRole: authzData.course_instance_role,
    prairieTestReservations,
  });

  return resolverResultToAuthzAssessment(result, authzData.mode, courseInstance.display_timezone);
}

interface ModernAssessmentInstanceAccessInput extends ModernAssessmentAccessInput {
  assessmentInstance: {
    id: string;
    user_id: string | null;
    team_id: string | null;
    date_limit: Date | null;
  };
}

export function applyInstanceAccess({
  assessmentResult,
  ownsInstance,
  timeLimitExpired,
  hasCourseInstancePermissionView,
}: {
  assessmentResult: SprocAuthzAssessment;
  ownsInstance: boolean;
  timeLimitExpired: boolean;
  hasCourseInstancePermissionView: boolean;
}): SprocAuthzAssessmentInstance {
  let authorizedEdit = assessmentResult.authorized && ownsInstance;

  if (!ownsInstance) {
    authorizedEdit = false;
    if (!hasCourseInstancePermissionView) {
      return {
        ...assessmentResult,
        authorized: false,
        authorized_edit: false,
        time_limit_expired: timeLimitExpired,
      };
    }
  }

  return {
    ...assessmentResult,
    authorized_edit: authorizedEdit,
    time_limit_expired: timeLimitExpired,
  };
}

export async function resolveModernAssessmentInstanceAccess({
  assessmentInstance,
  ...assessmentInput
}: ModernAssessmentInstanceAccessInput): Promise<SprocAuthzAssessmentInstance> {
  const assessmentResult = await resolveModernAssessmentAccess(assessmentInput);

  const { assessment, authzData, reqDate } = assessmentInput;

  const timeLimitExpired =
    assessmentInstance.date_limit != null && assessmentInstance.date_limit <= reqDate;

  // Determine if the effective user owns this assessment instance.
  // For group work, check that the user is in an active group matching
  // the instance's team. For individual work, check that the user_id matches.
  let ownsInstance: boolean;
  if (assessment.team_work && assessmentInstance.team_id != null) {
    const userGroupId = await getGroupId(assessment.id, authzData.user.id);
    ownsInstance = userGroupId != null && idsEqual(userGroupId, assessmentInstance.team_id);
  } else {
    ownsInstance = assessmentInstance.user_id === authzData.user.id;
  }

  return applyInstanceAccess({
    assessmentResult,
    ownsInstance,
    timeLimitExpired,
    hasCourseInstancePermissionView: authzData.has_course_instance_permission_view,
  });
}

interface ModernAssessmentAccessBatchInput {
  courseInstance: CourseInstance;
  userId: string;
  authzData: AuthzDataForAccessControl;
  reqDate: Date;
}

export async function resolveModernAssessmentAccessBatch({
  courseInstance,
  userId,
  authzData,
  reqDate,
}: ModernAssessmentAccessBatchInput): Promise<Map<string, SprocAuthzAssessment>> {
  const [allRules, { enrollment, prairieTestReservations }] = await Promise.all([
    selectAccessControlRulesForCourseInstance(courseInstance),
    selectUserAccessContext(userId, courseInstance, reqDate),
  ]);

  const results = new Map<string, SprocAuthzAssessment>();

  for (const [assessmentId, rules] of allRules) {
    const result = resolveAccessControl({
      rules,
      enrollment,
      date: reqDate,
      displayTimezone: courseInstance.display_timezone,
      authzMode: authzData.mode,
      courseRole: authzData.course_role,
      courseInstanceRole: authzData.course_instance_role,
      prairieTestReservations,
    });

    results.set(
      assessmentId,
      resolverResultToAuthzAssessment(result, authzData.mode, courseInstance.display_timezone),
    );
  }

  return results;
}
