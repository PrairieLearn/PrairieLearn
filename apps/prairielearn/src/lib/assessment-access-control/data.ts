import { z } from 'zod';

import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { assertNever } from '@prairielearn/utils';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import {
  type Assessment,
  AssessmentAccessControlPrairietestExamSchema,
  AssessmentAccessControlRuleSchema,
  type CourseInstance,
} from '../db-types.js';

import type {
  AccessControlRuleInput,
  EnrollmentContext,
  PrairieTestReservation,
  RuntimeAfterComplete,
} from './resolver.js';
import type { RuntimeDateControl } from './timeline.js';

const sql = loadSqlEquiv(import.meta.url);

const DeadlineJsonSchema = z.array(z.object({ date: z.string(), credit: z.number() })).nullable();

const PrairieTestExamJsonSchema = z
  .array(
    AssessmentAccessControlPrairietestExamSchema.pick({
      uuid: true,
      read_only: true,
      after_complete_questions_hidden: true,
      after_complete_score_hidden: true,
    }),
  )
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

function buildDateControl(
  rule: AssessmentAccessControlRule,
  earlyDeadlines: z.infer<typeof DeadlineJsonSchema>,
  lateDeadlines: z.infer<typeof DeadlineJsonSchema>,
): RuntimeDateControl | undefined {
  // Only include fields that were explicitly configured (overridden flag is true).
  const dateControl: RuntimeDateControl = {};

  if (rule.date_control_release_date != null) {
    dateControl.release = { date: rule.date_control_release_date };
  }

  if (rule.date_control_due_overridden) {
    dateControl.due = {
      date: rule.date_control_due_date,
      ...(rule.date_control_due_credit != null ? { credit: rule.date_control_due_credit } : {}),
    };
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

  if (rule.date_control_after_last_deadline_allow_submissions != null) {
    dateControl.afterLastDeadline = {
      allowSubmissions: rule.date_control_after_last_deadline_allow_submissions,
      ...(rule.date_control_after_last_deadline_allow_submissions
        ? { credit: rule.date_control_after_last_deadline_credit }
        : {}),
    };
  }

  return Object.keys(dateControl).length > 0 ? dateControl : undefined;
}

function buildAfterComplete(rule: AssessmentAccessControlRule): RuntimeAfterComplete | undefined {
  const afterComplete: RuntimeAfterComplete = {};

  if (rule.after_complete_questions_hidden != null) {
    afterComplete.questions = {
      hidden: rule.after_complete_questions_hidden,
      visibleFromDate: rule.after_complete_questions_visible_from_date ?? null,
      visibleUntilDate: rule.after_complete_questions_visible_until_date ?? null,
    };
  }

  if (rule.after_complete_score_hidden != null) {
    afterComplete.score = {
      hidden: rule.after_complete_score_hidden,
      visibleFromDate: rule.after_complete_score_visible_from_date ?? null,
    };
  }

  return Object.keys(afterComplete).length > 0 ? afterComplete : undefined;
}

function rowToAccessControlRuleInput(row: AccessControlRuleRow): AccessControlRuleInput {
  const rule = row.access_control_rule;
  const dateControl = buildDateControl(rule, row.early_deadlines, row.late_deadlines);
  const afterComplete = buildAfterComplete(rule);

  const ruleBody = {
    ...(dateControl && { dateControl }),
    ...(afterComplete && { afterComplete }),
  };

  switch (rule.target_type) {
    case 'enrollment':
      return {
        targetType: 'enrollment',
        number: rule.number,
        rule: ruleBody,
        enrollmentIds: row.enrollment_ids,
      };
    case 'student_label':
      return {
        targetType: 'student_label',
        number: rule.number,
        rule: ruleBody,
        studentLabelIds: row.student_label_ids,
      };
    case 'none':
      return {
        targetType: 'none',
        number: 0,
        rule: {
          ...ruleBody,
          beforeRelease: { listed: rule.before_release_listed ?? false },
          prairieTestExams: (row.prairietest_exams ?? []).map((e) => ({
            uuid: e.uuid,
            readOnly: e.read_only,
            questionsHidden: e.after_complete_questions_hidden,
            scoreHidden: e.after_complete_score_hidden,
          })),
        },
      };
    default:
      assertNever(rule.target_type);
  }
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
