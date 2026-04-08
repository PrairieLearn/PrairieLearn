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

import {
  type AccessDisplayModel,
  type ModernAccessAvailability,
  buildModernAccessDisplayModel,
} from './access-display.js';
import {
  selectAccessControlRulesForAssessment,
  selectAccessControlRulesForCourseInstance,
  selectUserAccessContext,
} from './data.js';
import {
  type AccessControlResolverResult,
  computeCredit,
  evaluatePrairieTestAccess,
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

export interface ModernAccessRenderInfo {
  availability: ModernAccessAvailability;
  accessDisplayModel: AccessDisplayModel;
}

export interface ModernAssessmentAccessResult {
  authzResult: SprocAuthzAssessment;
  renderInfo: ModernAccessRenderInfo;
}

export interface ModernAssessmentInstanceAccessResult {
  authzResult: SprocAuthzAssessmentInstance;
  renderInfo: ModernAccessRenderInfo;
}

function buildClosedHiddenRenderInfo(displayTimezone: string): ModernAccessRenderInfo {
  const availability: ModernAccessAvailability = {
    state: 'closed',
    listed: false,
    opensAt: null,
  };

  return {
    availability,
    accessDisplayModel: buildModernAccessDisplayModel({
      availability,
      displayTimezone,
      prairieTestExamCount: 0,
    }),
  };
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

function deriveAvailability({
  result,
  effectiveRule,
  prairieTestExams,
  prairieTestReservations,
  authzMode,
  reqDate,
}: {
  result: AccessControlResolverResult;
  effectiveRule: NonNullable<ReturnType<typeof resolveEffectiveRuleContext>>['effectiveRule'];
  prairieTestExams: NonNullable<ReturnType<typeof resolveEffectiveRuleContext>>['prairieTestExams'];
  prairieTestReservations: Parameters<
    typeof evaluatePrairieTestAccess
  >[0]['prairieTestReservations'];
  authzMode: EnumMode | null;
  reqDate: Date;
}): ModernAccessAvailability {
  const creditResult = computeCredit(effectiveRule.dateControl, reqDate, authzMode);
  const prairieTestOutcome = evaluatePrairieTestAccess({
    prairieTestExams,
    prairieTestReservations,
    authzMode,
    listBeforeRelease: effectiveRule.listBeforeRelease ?? false,
    assessmentClosed:
      !!effectiveRule.dateControl?.releaseDate &&
      !creditResult.beforeRelease &&
      !creditResult.active,
  });

  if (
    prairieTestOutcome.action === 'deny' &&
    prairieTestOutcome.reason === 'prairietest_gated_unavailable'
  ) {
    return {
      state: 'prairietest_gated_unavailable',
      listed: prairieTestOutcome.listed,
      opensAt: null,
    };
  }

  if (creditResult.beforeRelease) {
    return {
      state: 'future_open',
      listed: result.showBeforeRelease,
      opensAt: creditResult.nextDeadlineDate,
    };
  }

  if (!effectiveRule.dateControl?.releaseDate) {
    return {
      state: 'before_release',
      listed: result.showBeforeRelease,
      opensAt: null,
    };
  }

  if (result.active) {
    return {
      state: 'open',
      listed: true,
      opensAt: null,
    };
  }

  return {
    state: 'closed',
    listed: true,
    opensAt: null,
  };
}

export function buildModernAccessRenderInfo({
  result,
  effectiveRule,
  prairieTestExamCount,
  prairieTestExams,
  prairieTestReservations,
  displayTimezone,
  authzMode,
  reqDate,
}: {
  result: AccessControlResolverResult;
  effectiveRule: NonNullable<ReturnType<typeof resolveEffectiveRuleContext>>['effectiveRule'];
  prairieTestExamCount: number;
  prairieTestExams: NonNullable<ReturnType<typeof resolveEffectiveRuleContext>>['prairieTestExams'];
  prairieTestReservations: Parameters<
    typeof evaluatePrairieTestAccess
  >[0]['prairieTestReservations'];
  displayTimezone: string;
  authzMode: EnumMode | null;
  reqDate: Date;
}): ModernAccessRenderInfo {
  const availability = deriveAvailability({
    result,
    effectiveRule,
    prairieTestExams,
    prairieTestReservations,
    authzMode,
    reqDate,
  });

  return {
    availability,
    accessDisplayModel: buildModernAccessDisplayModel({
      listBeforeRelease: effectiveRule.listBeforeRelease,
      dateControl: effectiveRule.dateControl,
      afterComplete: effectiveRule.afterComplete,
      availability,
      displayTimezone,
      prairieTestExamCount,
    }),
  };
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
    renderInfo:
      ruleContext == null
        ? buildClosedHiddenRenderInfo(courseInstance.display_timezone)
        : buildModernAccessRenderInfo({
            result,
            effectiveRule: ruleContext.effectiveRule,
            prairieTestExamCount: ruleContext.prairieTestExamCount,
            prairieTestExams: ruleContext.prairieTestExams,
            prairieTestReservations,
            displayTimezone: courseInstance.display_timezone,
            authzMode: authzData.mode ?? null,
            reqDate,
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
    renderInfo: assessmentAccess.renderInfo,
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
      renderInfo:
        ruleContext == null
          ? buildClosedHiddenRenderInfo(courseInstance.display_timezone)
          : buildModernAccessRenderInfo({
              result,
              effectiveRule: ruleContext.effectiveRule,
              prairieTestExamCount: ruleContext.prairieTestExamCount,
              prairieTestExams: ruleContext.prairieTestExams,
              prairieTestReservations,
              displayTimezone: courseInstance.display_timezone,
              authzMode: authzData.mode ?? null,
              reqDate,
            }),
    });
  }

  return results;
}
