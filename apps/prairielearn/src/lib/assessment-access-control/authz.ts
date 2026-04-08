import type { z } from 'zod';

import type {
  Assessment,
  CourseInstance,
  EnumCourseInstanceRole,
  EnumCourseRole,
  EnumMode,
  SprocAuthzAssessmentInstanceSchema,
  SprocAuthzAssessmentSchema,
} from '../db-types.js';
import { getGroupId } from '../groups.js';
import { idsEqual } from '../id.js';

import { type AccessDisplayModel, buildModernAccessDisplayModel } from './access-display.js';
import {
  selectAccessControlRulesForAssessment,
  selectAccessControlRulesForCourseInstance,
  selectUserAccessContext,
} from './data.js';
import {
  type AccessControlResolverResult,
  resolveAccessControlFromRuleContext,
  resolveEffectiveRuleContext,
} from './resolver.js';

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
}

export interface ModernAssessmentAccessResult {
  authzResult: SprocAuthzAssessment;
  accessDisplayModel: AccessDisplayModel;
}

export interface ModernAssessmentInstanceAccessResult {
  authzResult: SprocAuthzAssessmentInstance;
  accessDisplayModel: AccessDisplayModel;
}

function buildClosedHiddenAccessDisplayModel(displayTimezone: string): AccessDisplayModel {
  return buildModernAccessDisplayModel({
    availabilityState: 'closed',
    availabilityListed: false,
    opensAt: null,
    timeline: [],
    displayTimezone,
    prairieTestExamCount: 0,
  });
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
    show_before_release: result.showBeforeRelease,
    next_active_time: null,
    access_rules: [],
  };
}

export function buildAccessDisplayModelFromResult({
  result,
  effectiveRule,
  prairieTestExamCount,
  displayTimezone,
}: {
  result: AccessControlResolverResult;
  effectiveRule: NonNullable<ReturnType<typeof resolveEffectiveRuleContext>>['effectiveRule'];
  prairieTestExamCount: number;
  displayTimezone: string;
}): AccessDisplayModel {
  return buildModernAccessDisplayModel({
    listBeforeRelease: effectiveRule.listBeforeRelease,
    dateControl: effectiveRule.dateControl,
    afterComplete: effectiveRule.afterComplete,
    timeline: result.timeline,
    availabilityState: result.availabilityState,
    availabilityListed: result.availabilityListed,
    opensAt: result.opensAt,
    displayTimezone,
    prairieTestExamCount,
  });
}

export async function resolveModernAssessmentAccess({
  assessment,
  userId,
  courseInstance,
  authzData,
  reqDate,
}: ModernAssessmentAccessInput): Promise<ModernAssessmentAccessResult> {
  const [rules, { enrollment, prairieTestReservations }] = await Promise.all([
    selectAccessControlRulesForAssessment(assessment),
    selectUserAccessContext(userId, courseInstance, reqDate),
  ]);

  const ruleContext = resolveEffectiveRuleContext({ rules, enrollment });
  const result = resolveAccessControlFromRuleContext({
    date: reqDate,
    displayTimezone: courseInstance.display_timezone,
    authzMode: authzData.mode ?? null,
    courseRole: authzData.course_role ?? 'None',
    courseInstanceRole: authzData.course_instance_role ?? 'None',
    prairieTestReservations,
    ruleContext,
  });

  return {
    authzResult: resolverResultToSprocAuthzAssessment(result, authzData.mode),
    accessDisplayModel:
      ruleContext == null
        ? buildClosedHiddenAccessDisplayModel(courseInstance.display_timezone)
        : buildAccessDisplayModelFromResult({
            result,
            effectiveRule: ruleContext.effectiveRule,
            prairieTestExamCount: ruleContext.prairieTestExamCount,
            displayTimezone: courseInstance.display_timezone,
          }),
  };
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
}: ModernAssessmentInstanceAccessInput): Promise<ModernAssessmentInstanceAccessResult> {
  const assessmentAccess = await resolveModernAssessmentAccess(assessmentInput);

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

  return {
    authzResult: applyInstanceAccess({
      assessmentResult: assessmentAccess.authzResult,
      ownsInstance,
      timeLimitExpired,
      hasCourseInstancePermissionView: authzData.has_course_instance_permission_view ?? false,
    }),
    accessDisplayModel: assessmentAccess.accessDisplayModel,
  };
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
}: ModernAssessmentAccessBatchInput): Promise<Map<string, ModernAssessmentAccessResult>> {
  const [allRules, { enrollment, prairieTestReservations }] = await Promise.all([
    selectAccessControlRulesForCourseInstance(courseInstance),
    selectUserAccessContext(userId, courseInstance, reqDate),
  ]);

  const results = new Map<string, ModernAssessmentAccessResult>();

  for (const [assessmentId, rules] of allRules) {
    const ruleContext = resolveEffectiveRuleContext({ rules, enrollment });
    const result = resolveAccessControlFromRuleContext({
      date: reqDate,
      displayTimezone: courseInstance.display_timezone,
      authzMode: authzData.mode ?? null,
      courseRole: authzData.course_role ?? 'None',
      courseInstanceRole: authzData.course_instance_role ?? 'None',
      prairieTestReservations,
      ruleContext,
    });

    results.set(assessmentId, {
      authzResult: resolverResultToSprocAuthzAssessment(result, authzData.mode),
      accessDisplayModel:
        ruleContext == null
          ? buildClosedHiddenAccessDisplayModel(courseInstance.display_timezone)
          : buildAccessDisplayModelFromResult({
              result,
              effectiveRule: ruleContext.effectiveRule,
              prairieTestExamCount: ruleContext.prairieTestExamCount,
              displayTimezone: courseInstance.display_timezone,
            }),
    });
  }

  return results;
}
