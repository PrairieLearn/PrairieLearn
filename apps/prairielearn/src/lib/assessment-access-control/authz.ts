import { run } from '@prairielearn/run';

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
    // The resolver uses `submittable` (can the student submit work?
    // the legacy field name is `active`, we map it to the legacy name.
    active: result.submittable,
    show_closed_assessment: result.visibility.showQuestions,
    show_closed_assessment_score: result.visibility.showScore,
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

async function resolveModernAssessmentAccessResult({
  assessment,
  userId,
  courseInstance,
  authzData,
  reqDate,
}: ModernAssessmentAccessInput): Promise<AccessControlResolverResult> {
  const [rules, { enrollment, prairieTestReservations }] = await Promise.all([
    selectAccessControlRulesForAssessment(assessment),
    selectUserAccessContext(userId, courseInstance, reqDate),
  ]);

  return resolveAccessControl({
    rules,
    enrollment,
    date: reqDate,
    displayTimezone: courseInstance.display_timezone,
    authzMode: authzData.mode,
    courseRole: authzData.course_role,
    courseInstanceRole: authzData.course_instance_role,
    prairieTestReservations,
  });
}

export async function resolveModernAssessmentAccess(
  input: ModernAssessmentAccessInput,
): Promise<SprocAuthzAssessment> {
  const result = await resolveModernAssessmentAccessResult(input);
  return resolverResultToAuthzAssessment(
    result,
    input.authzData.mode,
    input.courseInstance.display_timezone,
  );
}

interface ModernAssessmentInstanceAccessInput extends ModernAssessmentAccessInput {
  assessmentInstance: {
    id: string;
    user_id: string | null;
    team_id: string | null;
    open: boolean | null;
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
  const { assessment, authzData, reqDate } = assessmentInput;

  const result = await resolveModernAssessmentAccessResult(assessmentInput);
  const assessmentResult = resolverResultToAuthzAssessmentForInstance({
    result,
    authzMode: authzData.mode,
    displayTimezone: assessmentInput.courseInstance.display_timezone,
    assessmentInstance,
    reqDate,
  });

  // Determine if the effective user owns this assessment instance.
  // Ownership is determined by the data on the instance itself, not the
  // assessment's current team_work setting: an instance created before/after
  // team_work was toggled may have user_id set even when team_work is now
  // true (or vice versa), and the original creator should still be recognized
  // as the owner.
  let ownsInstance: boolean;
  if (assessmentInstance.team_id != null) {
    const userGroupId = await getGroupId(assessment.id, authzData.user.id);
    ownsInstance = userGroupId != null && idsEqual(userGroupId, assessmentInstance.team_id);
  } else {
    ownsInstance = assessmentInstance.user_id === authzData.user.id;
  }

  const timeLimitExpired =
    assessmentInstance.date_limit != null && assessmentInstance.date_limit <= reqDate;

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

export async function resolveModernAssessmentAccessResultsBatch({
  courseInstance,
  userId,
  authzData,
  reqDate,
}: ModernAssessmentAccessBatchInput): Promise<Map<string, AccessControlResolverResult>> {
  const [allRules, { enrollment, prairieTestReservations }] = await Promise.all([
    selectAccessControlRulesForCourseInstance(courseInstance),
    selectUserAccessContext(userId, courseInstance, reqDate),
  ]);

  const results = new Map<string, AccessControlResolverResult>();

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

    results.set(assessmentId, result);
  }

  return results;
}

export function resolverResultToAuthzAssessmentForInstance({
  result,
  authzMode,
  displayTimezone,
  assessmentInstance,
  reqDate,
}: {
  result: AccessControlResolverResult;
  authzMode: EnumMode;
  displayTimezone: string;
  assessmentInstance: { open: boolean | null; date_limit: Date | null } | null;
  reqDate: Date;
}): SprocAuthzAssessment {
  const resultForInstance = run((): AccessControlResolverResult => {
    if (assessmentInstance == null) return result;
    if (result.visibilitySource === 'prairieTest') return result;

    const timeLimitExpired =
      assessmentInstance.date_limit != null && assessmentInstance.date_limit <= reqDate;
    if (assessmentInstance.open !== false && !timeLimitExpired) {
      return result;
    }

    return {
      ...result,
      creditDateString: 'None',
      timeLimitMin: null,
      password: null,
      visibility: result.afterCompleteVisibility,
      visibilitySource: 'afterComplete',
      complete: true,
      submittable: false,
    };
  });

  return resolverResultToAuthzAssessment(resultForInstance, authzMode, displayTimezone);
}
