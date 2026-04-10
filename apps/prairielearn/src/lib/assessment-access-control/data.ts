import { z } from 'zod';

import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import {
  type Assessment,
  AssessmentAccessControlRuleSchema,
  type CourseInstance,
} from '../db-types.js';

import type {
  AccessControlRuleInput,
  EnrollmentContext,
  PrairieTestReservation,
  RuntimeAccessControl,
  RuntimeAfterComplete,
  RuntimeDateControl,
} from './resolver.js';

const sql = loadSqlEquiv(import.meta.url);

const DeadlineJsonSchema = z.array(z.object({ date: z.string(), credit: z.number() })).nullable();

const PrairieTestExamJsonSchema = z
  .array(z.object({ uuid: z.string(), read_only: z.boolean() }))
  .nullable();

const AccessControlRuleRowSchema = z.object({
  access_control_rule: AssessmentAccessControlRuleSchema,
  enrollment_ids: z.array(IdSchema),
  student_label_ids: z.array(IdSchema),
  prairietest_exams: PrairieTestExamJsonSchema,
  early_deadlines: DeadlineJsonSchema,
  late_deadlines: DeadlineJsonSchema,
});

type AccessControlRuleRow = z.infer<typeof AccessControlRuleRowSchema>;
type AssessmentAccessControlRule = z.infer<typeof AssessmentAccessControlRuleSchema>;

function isOverride(rule: AssessmentAccessControlRule): boolean {
  return rule.target_type !== 'none';
}

function buildDateControl(
  rule: AssessmentAccessControlRule,
  earlyDeadlines: z.infer<typeof DeadlineJsonSchema>,
  lateDeadlines: z.infer<typeof DeadlineJsonSchema>,
): RuntimeDateControl | undefined {
  // Only include fields that were explicitly configured (overridden flag is true).
  // This applies uniformly to main rules and overrides.
  const dateControl: RuntimeDateControl = {};

  if (rule.date_control_release_date != null) {
    dateControl.releaseDate = rule.date_control_release_date;
  }

  if (rule.date_control_due_date_overridden) {
    dateControl.dueDate = rule.date_control_due_date;
  }

  if (rule.date_control_duration_minutes_overridden) {
    dateControl.durationMinutes = rule.date_control_duration_minutes;
  }

  if (rule.date_control_password_overridden) {
    dateControl.password = rule.date_control_password;
  }

  if (rule.date_control_early_deadlines_overridden) {
    dateControl.earlyDeadlines =
      earlyDeadlines?.map((d) => ({
        date: d.date,
        credit: d.credit,
      })) ?? null;
  }

  if (rule.date_control_late_deadlines_overridden) {
    dateControl.lateDeadlines =
      lateDeadlines?.map((d) => ({
        date: d.date,
        credit: d.credit,
      })) ?? null;
  }

  {
    const includeCredit = rule.date_control_after_last_deadline_credit_overridden;
    const includeAllowSubmissions = rule.date_control_after_last_deadline_allow_submissions != null;

    if (includeCredit || includeAllowSubmissions) {
      if (
        rule.date_control_after_last_deadline_credit_overridden &&
        rule.date_control_after_last_deadline_credit == null &&
        rule.date_control_after_last_deadline_allow_submissions == null
      ) {
        dateControl.afterLastDeadline = null;
      } else {
        dateControl.afterLastDeadline = {};
        if (rule.date_control_after_last_deadline_credit != null) {
          dateControl.afterLastDeadline.credit = rule.date_control_after_last_deadline_credit;
        }
        if (includeAllowSubmissions) {
          dateControl.afterLastDeadline.allowSubmissions =
            rule.date_control_after_last_deadline_allow_submissions!;
        }
      }
    }
  }

  return Object.keys(dateControl).length > 0 ? dateControl : undefined;
}

function buildAfterComplete(rule: AssessmentAccessControlRule): RuntimeAfterComplete | undefined {
  const override = isOverride(rule);
  const includeField = (overridden: boolean) => !override || overridden;

  const afterComplete: RuntimeAfterComplete = {};

  if (rule.after_complete_hide_questions != null) {
    afterComplete.hideQuestions = rule.after_complete_hide_questions;
  }
  if (includeField(rule.after_complete_hide_questions_again_date_overridden)) {
    afterComplete.hideQuestionsAgainDate = rule.after_complete_hide_questions_again_date ?? null;
  }

  if (includeField(rule.after_complete_show_questions_again_date_overridden)) {
    afterComplete.showQuestionsAgainDate = rule.after_complete_show_questions_again_date ?? null;
  }

  if (rule.after_complete_hide_score != null) {
    afterComplete.hideScore = rule.after_complete_hide_score;
  }
  if (includeField(rule.after_complete_show_score_again_date_overridden)) {
    afterComplete.showScoreAgainDate = rule.after_complete_show_score_again_date ?? null;
  }

  return Object.keys(afterComplete).length > 0 ? afterComplete : undefined;
}

function rowToAccessControlRuleInput(row: AccessControlRuleRow): AccessControlRuleInput {
  const runtimeRule: RuntimeAccessControl = {};
  const rule = row.access_control_rule;

  if (!isOverride(rule)) {
    runtimeRule.listBeforeRelease = rule.list_before_release ?? false;
  }

  const dateControl = buildDateControl(rule, row.early_deadlines, row.late_deadlines);
  if (dateControl !== undefined) runtimeRule.dateControl = dateControl;

  const afterComplete = buildAfterComplete(rule);
  if (afterComplete !== undefined) runtimeRule.afterComplete = afterComplete;

  // Integrations are only on main rules (number 0)
  const prairietestExamsRaw = (!isOverride(rule) && row.prairietest_exams) || [];
  const prairietestExams = prairietestExamsRaw.map((e) => ({
    uuid: e.uuid,
    readOnly: e.read_only,
  }));
  if (prairietestExams.length > 0) {
    runtimeRule.integrations = {
      prairieTest: {
        exams: prairietestExams.map((e) => ({ examUuid: e.uuid, readOnly: e.readOnly })),
      },
    };
  }

  return {
    rule: runtimeRule,
    number: rule.number,
    targetType: rule.target_type,
    enrollmentIds: row.enrollment_ids,
    studentLabelIds: row.student_label_ids,
    prairietestExams,
  };
}

export async function selectAccessControlRulesForAssessment(
  assessment: Assessment,
): Promise<AccessControlRuleInput[]> {
  const rows = await queryRows(
    sql.select_access_control_rules,
    { assessment_id: assessment.id, course_instance_id: null },
    AccessControlRuleRowSchema,
  );
  return rows.map(rowToAccessControlRuleInput);
}

export async function selectAccessControlRulesForCourseInstance(
  courseInstance: CourseInstance,
): Promise<Map<string, AccessControlRuleInput[]>> {
  const rows = await queryRows(
    sql.select_access_control_rules,
    { assessment_id: null, course_instance_id: courseInstance.id },
    AccessControlRuleRowSchema,
  );

  const result = new Map<string, AccessControlRuleInput[]>();
  for (const row of rows) {
    const assessmentId = row.access_control_rule.assessment_id;
    if (!result.has(assessmentId)) {
      result.set(assessmentId, []);
    }
    result.get(assessmentId)!.push(rowToAccessControlRuleInput(row));
  }
  return result;
}

interface UserAccessContext {
  enrollment: EnrollmentContext | null;
  prairieTestReservations: PrairieTestReservation[];
}

const UserAccessContextRowSchema = z.object({
  enrollment: z
    .object({
      enrollment_id: IdSchema,
      student_label_ids: z.array(IdSchema),
    })
    .nullable(),
  reservations: z.array(
    z.object({
      exam_uuid: z.string(),
      access_end: DateFromISOString,
    }),
  ),
});

export async function selectUserAccessContext(
  userId: string,
  courseInstance: CourseInstance,
  date: Date,
): Promise<UserAccessContext> {
  const row = await queryRow(
    sql.select_user_access_context,
    { user_id: userId, course_instance_id: courseInstance.id, date },
    UserAccessContextRowSchema,
  );

  return {
    enrollment: row.enrollment
      ? {
          enrollmentId: row.enrollment.enrollment_id,
          studentLabelIds: row.enrollment.student_label_ids,
        }
      : null,
    prairieTestReservations: row.reservations.map((r) => ({
      examUuid: r.exam_uuid,
      accessEnd: r.access_end,
    })),
  };
}
