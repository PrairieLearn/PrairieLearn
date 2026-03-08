import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import type { AccessControlJson } from '../schemas/accessControl.js';

import type {
  AccessControlRuleInput,
  PrairieTestReservation,
  StudentContext,
} from './access-control-resolver.js';
import { AssessmentAccessControlSchema } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const DeadlineJsonSchema = z.array(z.object({ date: z.string(), credit: z.number() })).nullable();

const AccessControlRuleRowSchema = AssessmentAccessControlSchema.omit({
  assessment_id: true,
  course_instance_id: true,
}).extend({
  enrollment_ids: z.array(IdSchema),
  student_label_ids: z.array(IdSchema),
  prairietest_exam_uuids: z.array(z.string()),
  early_deadlines: DeadlineJsonSchema,
  late_deadlines: DeadlineJsonSchema,
});

const CourseInstanceAccessControlRuleRowSchema = AccessControlRuleRowSchema.extend({
  assessment_id: IdSchema,
});

type AccessControlRuleRow = z.infer<typeof AccessControlRuleRowSchema>;

function isOverride(row: AccessControlRuleRow): boolean {
  return row.number > 0;
}

function buildDateControl(row: AccessControlRuleRow): AccessControlJson['dateControl'] | undefined {
  const override = isOverride(row);

  if (override && !row.date_control_overridden) {
    return undefined;
  }

  // For overrides, only include fields where *_overridden = true.
  // For main rules (number 0), include all fields.
  const includeField = (overridden: boolean) => !override || overridden;

  const dateControl: NonNullable<AccessControlJson['dateControl']> = {};
  let hasAnyField = false;

  if (includeField(true)) {
    // enabled is always included when dateControl is present
    // For overrides with date_control_overridden, the whole dateControl block is overridden
    if (override) {
      dateControl.enabled = true;
    }
  }

  if (includeField(row.date_control_release_date_overridden)) {
    if (row.date_control_release_date) {
      dateControl.releaseDate = row.date_control_release_date.toISOString();
      hasAnyField = true;
    }
  }

  if (includeField(row.date_control_due_date_overridden)) {
    dateControl.dueDate = row.date_control_due_date?.toISOString() ?? null;
    hasAnyField = true;
  }

  if (includeField(row.date_control_duration_minutes_overridden)) {
    if (row.date_control_duration_minutes != null) {
      dateControl.durationMinutes = row.date_control_duration_minutes;
      hasAnyField = true;
    }
  }

  if (includeField(row.date_control_password_overridden)) {
    if (row.date_control_password != null) {
      dateControl.password = row.date_control_password;
      hasAnyField = true;
    }
  }

  if (includeField(row.date_control_early_deadlines_overridden)) {
    dateControl.earlyDeadlines =
      row.early_deadlines?.map((d) => ({
        date: d.date,
        credit: d.credit,
      })) ?? null;
    hasAnyField = true;
  }

  if (includeField(row.date_control_late_deadlines_overridden)) {
    dateControl.lateDeadlines =
      row.late_deadlines?.map((d) => ({
        date: d.date,
        credit: d.credit,
      })) ?? null;
    hasAnyField = true;
  }

  {
    const includeCredit =
      includeField(row.date_control_after_last_deadline_credit_overridden) &&
      row.date_control_after_last_deadline_credit != null;
    const includeAllowSubmissions = row.date_control_after_last_deadline_allow_submissions != null;

    if (includeCredit || includeAllowSubmissions) {
      dateControl.afterLastDeadline = {};
      if (includeCredit) {
        dateControl.afterLastDeadline.credit = row.date_control_after_last_deadline_credit!;
      }
      if (includeAllowSubmissions) {
        dateControl.afterLastDeadline.allowSubmissions =
          row.date_control_after_last_deadline_allow_submissions!;
      }
      hasAnyField = true;
    }
  }

  if (!override) {
    // Main rule always includes dateControl if any fields are set
    return hasAnyField ? dateControl : undefined;
  }

  // Override rule only includes dateControl if date_control_overridden is true
  return dateControl;
}

function buildAfterComplete(
  row: AccessControlRuleRow,
): AccessControlJson['afterComplete'] | undefined {
  const override = isOverride(row);
  const includeField = (overridden: boolean) => !override || overridden;

  const afterComplete: NonNullable<AccessControlJson['afterComplete']> = {};
  let hasAnyField = false;

  if (row.after_complete_hide_questions != null) {
    afterComplete.hideQuestions = row.after_complete_hide_questions;
    hasAnyField = true;
  }
  if (includeField(row.after_complete_hide_questions_again_date_overridden)) {
    if (row.after_complete_hide_questions_again_date) {
      afterComplete.hideQuestionsAgainDate =
        row.after_complete_hide_questions_again_date.toISOString();
      hasAnyField = true;
    }
  }

  if (includeField(row.after_complete_show_questions_again_date_overridden)) {
    if (row.after_complete_show_questions_again_date) {
      afterComplete.showQuestionsAgainDate =
        row.after_complete_show_questions_again_date.toISOString();
      hasAnyField = true;
    }
  }

  if (row.after_complete_hide_score != null) {
    afterComplete.hideScore = row.after_complete_hide_score;
    hasAnyField = true;
  }
  if (includeField(row.after_complete_show_score_again_date_overridden)) {
    if (row.after_complete_show_score_again_date) {
      afterComplete.showScoreAgainDate = row.after_complete_show_score_again_date.toISOString();
      hasAnyField = true;
    }
  }

  return hasAnyField ? afterComplete : undefined;
}

function rowToAccessControlRuleInput(row: AccessControlRuleRow): AccessControlRuleInput {
  const rule: AccessControlJson = {};

  if (row.enabled != null) rule.enabled = row.enabled;
  if (row.block_access != null) rule.blockAccess = row.block_access;
  if (row.list_before_release != null) rule.listBeforeRelease = row.list_before_release;

  const dateControl = buildDateControl(row);
  if (dateControl !== undefined) rule.dateControl = dateControl;

  const afterComplete = buildAfterComplete(row);
  if (afterComplete !== undefined) rule.afterComplete = afterComplete;

  // Integrations are only on main rules (number 0)
  if (!isOverride(row) && row.prairietest_exam_uuids.length > 0) {
    rule.integrations = {
      prairieTest: {
        enabled: true,
        exams: row.prairietest_exam_uuids.map((uuid) => ({ examUuid: uuid })),
      },
    };
  }

  return {
    rule,
    number: row.number,
    targetType: row.target_type,
    enrollmentIds: row.enrollment_ids,
    studentLabelIds: row.student_label_ids,
    prairietestExamUuids: !isOverride(row) ? row.prairietest_exam_uuids : [],
  };
}

export async function selectAccessControlRulesForAssessment(
  courseInstanceId: string,
  assessmentId: string,
): Promise<AccessControlRuleInput[]> {
  const rows = await queryRows(
    sql.select_access_control_rules_for_assessment,
    { course_instance_id: courseInstanceId, assessment_id: assessmentId },
    AccessControlRuleRowSchema,
  );
  return rows.map(rowToAccessControlRuleInput);
}

export async function selectAccessControlRulesForCourseInstance(
  courseInstanceId: string,
): Promise<Map<string, AccessControlRuleInput[]>> {
  const rows = await queryRows(
    sql.select_access_control_rules_for_course_instance,
    { course_instance_id: courseInstanceId },
    CourseInstanceAccessControlRuleRowSchema,
  );

  const result = new Map<string, AccessControlRuleInput[]>();
  for (const row of rows) {
    const assessmentId = row.assessment_id;
    if (!result.has(assessmentId)) {
      result.set(assessmentId, []);
    }
    result.get(assessmentId)!.push(rowToAccessControlRuleInput(row));
  }
  return result;
}

const StudentContextRowSchema = z.object({
  enrollment_id: IdSchema,
  student_label_ids: z.array(IdSchema),
});

export async function selectStudentContext(
  userId: string,
  courseInstanceId: string,
): Promise<StudentContext> {
  const row = await queryOptionalRow(
    sql.select_student_context,
    { user_id: userId, course_instance_id: courseInstanceId },
    StudentContextRowSchema,
  );
  if (!row) {
    return { enrollmentId: null, studentLabelIds: [] };
  }
  return {
    enrollmentId: row.enrollment_id,
    studentLabelIds: row.student_label_ids,
  };
}

const PrairieTestReservationRowSchema = z.object({
  exam_uuid: z.string(),
  access_end: DateFromISOString,
});

export async function selectPrairieTestReservation(
  userId: string,
  date: Date,
): Promise<PrairieTestReservation | null> {
  const row = await queryOptionalRow(
    sql.select_prairietest_reservation,
    { user_id: userId, date },
    PrairieTestReservationRowSchema,
  );
  if (!row) return null;
  return {
    examUuid: row.exam_uuid,
    accessEnd: row.access_end,
  };
}
