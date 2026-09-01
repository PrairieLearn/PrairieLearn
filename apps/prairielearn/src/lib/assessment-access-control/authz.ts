import { run } from '@prairielearn/run';

import type {
  Assessment,
  CourseInstance,
  EnumCourseInstanceRole,
  EnumCourseRole,
  EnumMode,
} from '../db-types.js';
import { getGroupId } from '../groups.js';
import { idsEqual } from '../id.js';

import type { AssessmentAuthzResult, AssessmentInstanceAuthzResult } from './authz-result.js';
import {
  selectAccessControlRulesForAssessment,
  selectAccessControlRulesForCourseInstance,
  selectUserAccessContext,
} from './data.js';
import {
  type AccessControlAuthorization,
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

function resolveAuthorization(
  authorization: AccessControlAuthorization,
  hasCompletedInstance: boolean,
): boolean {
  switch (authorization) {
    case 'granted':
      return true;
    case 'denied':
      return false;
    case 'requires-completed-instance':
      return hasCompletedInstance;
  }
}

function resolverResultToAssessmentAuthzResult(
  result: AccessControlResolverResult,
  authzMode: EnumMode,
  displayTimezone: string,
  hasCompletedInstance: boolean,
): AssessmentAuthzResult {
  return {
    authorized: resolveAuthorization(result.authorization, hasCompletedInstance),
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
): Promise<AssessmentAuthzResult> {
  const result = await resolveModernAssessmentAccessResult(input);
  return resolverResultToAssessmentAuthzResult(
    result,
    input.authzData.mode,
    input.courseInstance.display_timezone,
    false,
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
  assessmentResult: AssessmentAuthzResult;
  ownsInstance: boolean;
  timeLimitExpired: boolean;
  hasCourseInstancePermissionView: boolean;
}): AssessmentInstanceAuthzResult {
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
}: ModernAssessmentInstanceAccessInput): Promise<AssessmentInstanceAuthzResult> {
  const { assessment, authzData, reqDate } = assessmentInput;

  const result = await resolveModernAssessmentAccessResult(assessmentInput);
  const assessmentResult = resolverResultToAssessmentAuthzResultForInstance({
    result,
    authzMode: authzData.mode,
    displayTimezone: assessmentInput.courseInstance.display_timezone,
    assessmentInstance,
    reqDate,
  });

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

export function resolverResultToAssessmentAuthzResultForInstance({
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
}): AssessmentAuthzResult {
  const timeLimitExpired =
    assessmentInstance?.date_limit != null && assessmentInstance.date_limit <= reqDate;
  const hasCompletedInstance =
    assessmentInstance != null && (assessmentInstance.open === false || timeLimitExpired);

  const resultForInstance = run((): AccessControlResolverResult => {
    if (result.visibilitySource === 'prairieTest') return result;
    if (!hasCompletedInstance) return result;

    const authorized = resolveAuthorization(result.authorization, hasCompletedInstance);
    return {
      ...result,
      creditDateString: 'None',
      timeLimitMin: null,
      password: null,
      visibility: result.afterCompleteVisibility,
      visibilitySource: 'afterComplete',
      complete: true,
      submittable: false,
      showBeforeRelease: authorized ? false : result.showBeforeRelease,
    };
  });

  return resolverResultToAssessmentAuthzResult(
    resultForInstance,
    authzMode,
    displayTimezone,
    hasCompletedInstance,
  );
}
