import type { z } from 'zod';

import {
  selectAccessControlRulesForAssessment,
  selectAccessControlRulesForCourseInstance,
  selectPrairieTestReservation,
  selectStudentContext,
} from './access-control-data.js';
import { type AccessControlResolverResult, resolveAccessControl } from './access-control-resolver.js';
import type {
  EnumCourseInstanceRole,
  EnumCourseRole,
  EnumMode,
  EnumModeReason,
  SprocAuthzAssessmentInstanceSchema,
  SprocAuthzAssessmentSchema,
} from './db-types.js';
import { getGroupId } from './groups.js';
import { idsEqual } from './id.js';

type SprocAuthzAssessment = z.infer<typeof SprocAuthzAssessmentSchema>;
type SprocAuthzAssessmentInstance = z.infer<typeof SprocAuthzAssessmentInstanceSchema>;

interface AuthzDataForAccessControl {
  user: { id: string };
  mode?: EnumMode;
  mode_reason?: EnumModeReason;
  course_role?: EnumCourseRole;
  course_instance_role?: EnumCourseInstanceRole;
  has_course_instance_permission_view?: boolean;
}

interface ModernAssessmentAccessInput {
  assessmentId: string;
  userId: string;
  courseInstanceId: string;
  authzData: AuthzDataForAccessControl;
  reqDate: Date;
  displayTimezone: string;
}

function resolverResultToSprocAuthzAssessment(
  result: AccessControlResolverResult,
  authzMode: EnumMode | undefined,
  authzModeReason: EnumModeReason | undefined,
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
    mode:
      authzMode === 'Exam' && authzModeReason === 'PrairieTest' && result.examAccessEnd
        ? 'Exam'
        : null,
    next_active_time: null,
    access_rules: [],
  };
}

export async function resolveModernAssessmentAccess(
  input: ModernAssessmentAccessInput,
): Promise<SprocAuthzAssessment & { list_before_release: boolean; block_access: boolean }> {
  const { assessmentId, userId, courseInstanceId, authzData, reqDate, displayTimezone } = input;

  const [rules, student, prairieTestReservation] = await Promise.all([
    selectAccessControlRulesForAssessment(assessmentId),
    selectStudentContext(userId, courseInstanceId),
    authzData.mode === 'Exam' && authzData.mode_reason === 'PrairieTest'
      ? selectPrairieTestReservation(userId, reqDate)
      : Promise.resolve(null),
  ]);

  const result = resolveAccessControl({
    rules,
    student,
    date: reqDate,
    displayTimezone,
    authzMode: authzData.mode ?? null,
    authzModeReason: authzData.mode_reason ?? null,
    courseRole: authzData.course_role ?? 'None',
    courseInstanceRole: authzData.course_instance_role ?? 'None',
    prairieTestReservation,
  });

  return {
    ...resolverResultToSprocAuthzAssessment(result, authzData.mode, authzData.mode_reason),
    list_before_release: result.listBeforeRelease,
    block_access: result.blockAccess,
  };
}

interface ModernAssessmentInstanceAccessInput extends ModernAssessmentAccessInput {
  assessmentInstance: {
    id: string;
    user_id: string | null;
    team_id: string | null;
    date_limit: Date | null;
  };
  groupWork: boolean | null;
}

export async function resolveModernAssessmentInstanceAccess(
  input: ModernAssessmentInstanceAccessInput,
): Promise<SprocAuthzAssessmentInstance & { list_before_release: boolean; block_access: boolean }> {
  const assessmentResult = await resolveModernAssessmentAccess(input);

  const { assessmentInstance, authzData, reqDate, groupWork } = input;

  const timeLimitExpired =
    assessmentInstance.date_limit != null && assessmentInstance.date_limit <= reqDate;

  // Determine if the effective user owns this assessment instance.
  // For group work, check that the user is in an active group matching
  // the instance's team. For individual work, check that the user_id matches.
  let ownsInstance: boolean;
  if (groupWork && assessmentInstance.team_id != null) {
    const userGroupId = await getGroupId(input.assessmentId, authzData.user.id);
    ownsInstance = userGroupId != null && idsEqual(userGroupId, assessmentInstance.team_id);
  } else {
    ownsInstance = assessmentInstance.user_id === authzData.user.id;
  }

  let authorizedEdit = assessmentResult.authorized && ownsInstance;

  if (!ownsInstance) {
    authorizedEdit = false;
    if (!authzData.has_course_instance_permission_view) {
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

interface ModernAssessmentAccessBatchInput {
  courseInstanceId: string;
  userId: string;
  authzData: AuthzDataForAccessControl;
  reqDate: Date;
  displayTimezone: string;
}

export async function resolveModernAssessmentAccessBatch(
  input: ModernAssessmentAccessBatchInput,
): Promise<
  Map<string, SprocAuthzAssessment & { list_before_release: boolean; block_access: boolean }>
> {
  const { courseInstanceId, userId, authzData, reqDate, displayTimezone } = input;

  const [allRules, student, prairieTestReservation] = await Promise.all([
    selectAccessControlRulesForCourseInstance(courseInstanceId),
    selectStudentContext(userId, courseInstanceId),
    authzData.mode === 'Exam' && authzData.mode_reason === 'PrairieTest'
      ? selectPrairieTestReservation(userId, reqDate)
      : Promise.resolve(null),
  ]);

  const results = new Map<
    string,
    SprocAuthzAssessment & { list_before_release: boolean; block_access: boolean }
  >();

  for (const [assessmentId, rules] of allRules) {
    const result = resolveAccessControl({
      rules,
      student,
      date: reqDate,
      displayTimezone,
      authzMode: authzData.mode ?? null,
      authzModeReason: authzData.mode_reason ?? null,
      courseRole: authzData.course_role ?? 'None',
      courseInstanceRole: authzData.course_instance_role ?? 'None',
      prairieTestReservation,
    });

    results.set(assessmentId, {
      ...resolverResultToSprocAuthzAssessment(result, authzData.mode, authzData.mode_reason),
      list_before_release: result.listBeforeRelease,
      block_access: result.blockAccess,
    });
  }

  return results;
}
