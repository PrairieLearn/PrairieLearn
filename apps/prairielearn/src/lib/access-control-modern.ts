import type { z } from 'zod';

import {
  selectAccessControlRulesForAssessment,
  selectAccessControlRulesForCourseInstance,
  selectPrairieTestReservations,
  selectStudentContext,
} from './access-control-data.js';
import {
  type AccessControlResolverResult,
  resolveAccessControl,
} from './access-control-resolver.js';
import type {
  Assessment,
  CourseInstance,
  EnumCourseInstanceRole,
  EnumCourseRole,
  EnumMode,
  SprocAuthzAssessmentInstanceSchema,
  SprocAuthzAssessmentSchema,
} from './db-types.js';
import { getGroupId } from './groups.js';
import { idsEqual } from './id.js';

type SprocAuthzAssessment = z.infer<typeof SprocAuthzAssessmentSchema>;
type SprocAuthzAssessmentInstance = z.infer<typeof SprocAuthzAssessmentInstanceSchema>;

export interface AuthzDataForAccessControl {
  user: { id: string };
  mode?: EnumMode;
  course_role?: EnumCourseRole;
  course_instance_role?: EnumCourseInstanceRole;
  has_course_instance_permission_view?: boolean;
}

interface ModernAssessmentAccessInput {
  assessment: Assessment;
  userId: string;
  courseInstance: CourseInstance;
  authzData: AuthzDataForAccessControl;
  reqDate: Date;
  displayTimezone: string;
}

function resolverResultToSprocAuthzAssessment(
  result: AccessControlResolverResult,
  authzMode: EnumMode | undefined,
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
    next_active_time: null,
    access_rules: [],
  };
}

export async function resolveModernAssessmentAccess(
  input: ModernAssessmentAccessInput,
): Promise<SprocAuthzAssessment & { list_before_release: boolean }> {
  const { assessment, userId, courseInstance, authzData, reqDate, displayTimezone } = input;

  const [rules, student, prairieTestReservations] = await Promise.all([
    selectAccessControlRulesForAssessment(assessment),
    selectStudentContext(userId, courseInstance),
    authzData.mode === 'Exam'
      ? selectPrairieTestReservations(userId, reqDate)
      : Promise.resolve([]),
  ]);

  const result = resolveAccessControl({
    rules,
    student,
    date: reqDate,
    displayTimezone,
    authzMode: authzData.mode ?? null,
    courseRole: authzData.course_role ?? 'None',
    courseInstanceRole: authzData.course_instance_role ?? 'None',
    prairieTestReservations,
  });

  return {
    ...resolverResultToSprocAuthzAssessment(result, authzData.mode),
    list_before_release: result.listBeforeRelease,
  };
}

export interface ModernAssessmentInstanceAccessInput extends ModernAssessmentAccessInput {
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
): Promise<SprocAuthzAssessmentInstance & { list_before_release: boolean }> {
  const assessmentResult = await resolveModernAssessmentAccess(input);

  const { assessmentInstance, authzData, reqDate, groupWork } = input;

  const timeLimitExpired =
    assessmentInstance.date_limit != null && assessmentInstance.date_limit <= reqDate;

  // Determine if the effective user owns this assessment instance.
  // For group work, check that the user is in an active group matching
  // the instance's team. For individual work, check that the user_id matches.
  let ownsInstance: boolean;
  if (groupWork && assessmentInstance.team_id != null) {
    const userGroupId = await getGroupId(input.assessment.id, authzData.user.id);
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
  courseInstance: CourseInstance;
  userId: string;
  authzData: AuthzDataForAccessControl;
  reqDate: Date;
  displayTimezone: string;
}

export async function resolveModernAssessmentAccessBatch(
  input: ModernAssessmentAccessBatchInput,
): Promise<Map<string, SprocAuthzAssessment & { list_before_release: boolean }>> {
  const { courseInstance, userId, authzData, reqDate, displayTimezone } = input;

  const [allRules, student, prairieTestReservations] = await Promise.all([
    selectAccessControlRulesForCourseInstance(courseInstance),
    selectStudentContext(userId, courseInstance),
    authzData.mode === 'Exam'
      ? selectPrairieTestReservations(userId, reqDate)
      : Promise.resolve([]),
  ]);

  const results = new Map<string, SprocAuthzAssessment & { list_before_release: boolean }>();

  for (const [assessmentId, rules] of allRules) {
    const result = resolveAccessControl({
      rules,
      student,
      date: reqDate,
      displayTimezone,
      authzMode: authzData.mode ?? null,
      courseRole: authzData.course_role ?? 'None',
      courseInstanceRole: authzData.course_instance_role ?? 'None',
      prairieTestReservations,
    });

    results.set(assessmentId, {
      ...resolverResultToSprocAuthzAssessment(result, authzData.mode),
      list_before_release: result.listBeforeRelease,
    });
  }

  return results;
}
