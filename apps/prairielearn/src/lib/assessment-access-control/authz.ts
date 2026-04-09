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
  selectAccessControlRulesForAssessment,
  selectAccessControlRulesForCourseInstance,
  selectUserAccessContext,
} from './data.js';
import {
  type AccessControlResolverResult,
  type RuntimeDateControl,
  type TimelineEntry,
  formatDateShort,
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

interface ModernAssessmentAccessResult {
  authzResult: SprocAuthzAssessment;
  opensAt: Date | null;
}

interface ModernAssessmentInstanceAccessResult {
  authzResult: SprocAuthzAssessmentInstance;
}

function buildAccessRulesFromTimeline({
  timeline,
  dateControl,
  displayTimezone,
  currentCredit,
}: {
  timeline: TimelineEntry[];
  dateControl: RuntimeDateControl | undefined;
  displayTimezone: string;
  currentCredit: number | null;
}): SprocAuthzAssessment['access_rules'] {
  if (timeline.length === 0 || !dateControl?.releaseDate) return [];

  const fmt = (d: Date) => formatDateShort(d, displayTimezone);
  const rules: SprocAuthzAssessment['access_rules'] = [];

  // Each timeline entry means "before this date, credit = entry.credit".
  // Convert to rows with start/end ranges.
  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const startDate = i === 0 ? dateControl.releaseDate : timeline[i - 1].date;
    const credit = entry.credit;
    rules.push({
      credit: credit > 0 ? `${credit}%` : 'None',
      start_date: fmt(startDate),
      end_date: fmt(entry.date),
      time_limit_min: dateControl.durationMinutes ? `${dateControl.durationMinutes} min` : '—',
      mode: null,
      active: currentCredit != null && currentCredit === credit,
    });
  }

  // After the last deadline, show afterLastDeadline credit if > 0.
  const afterCredit = dateControl.afterLastDeadline?.credit ?? 0;
  if (afterCredit > 0) {
    rules.push({
      credit: `${afterCredit}%`,
      start_date: fmt(timeline[timeline.length - 1].date),
      end_date: '—',
      time_limit_min: dateControl.durationMinutes ? `${dateControl.durationMinutes} min` : '—',
      mode: null,
      active: currentCredit != null && currentCredit === afterCredit,
    });
  }

  return rules;
}

function resolverResultToSprocAuthzAssessment(
  result: AccessControlResolverResult,
  authzMode: EnumMode | undefined,
  dateControl: RuntimeDateControl | undefined,
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
    next_active_time: result.opensAt ? formatDateShort(result.opensAt, displayTimezone) : null,
    access_rules: buildAccessRulesFromTimeline({
      timeline: result.timeline,
      dateControl,
      displayTimezone,
      currentCredit: result.credit,
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
    authzResult: resolverResultToSprocAuthzAssessment(
      result,
      authzData.mode,
      ruleContext?.effectiveRule.dateControl,
      courseInstance.display_timezone,
    ),
    opensAt: result.opensAt,
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
      authzResult: resolverResultToSprocAuthzAssessment(
        result,
        authzData.mode,
        ruleContext?.effectiveRule.dateControl,
        courseInstance.display_timezone,
      ),
      opensAt: result.opensAt,
    });
  }

  return results;
}
