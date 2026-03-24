import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import type { AccessControlJson } from '../schemas/accessControl.js';

import type {
  AccessControlRuleInput,
  PrairieTestReservation,
  StudentContext,
} from './access-control-resolver.js';
import {
  type Assessment,
  AssessmentAccessControlRuleSchema,
  type CourseInstance,
} from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const DeadlineJsonSchema = z.array(z.object({ date: z.string(), credit: z.number() })).nullable();

const PrairieTestExamJsonSchema = z
  .array(z.object({ uuid: z.string(), read_only: z.boolean() }))
  .nullable();

const AccessControlRuleRowSchema = AssessmentAccessControlRuleSchema.omit({
  assessment_id: true,
}).extend({
  enrollment_ids: z.array(IdSchema),
  student_label_ids: z.array(IdSchema),
  prairietest_exams: PrairieTestExamJsonSchema,
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
  // Only include fields that were explicitly configured (overridden flag is true).
  // This applies uniformly to main rules and overrides.
  const dateControl: NonNullable<AccessControlJson['dateControl']> = {};
  let hasAnyField = false;

  if (row.date_control_release_date_overridden) {
    dateControl.releaseDate = row.date_control_release_date?.toISOString() ?? null;
    hasAnyField = true;
  }

  if (row.date_control_due_date_overridden) {
    dateControl.dueDate = row.date_control_due_date?.toISOString() ?? null;
    hasAnyField = true;
  }

  if (row.date_control_duration_minutes_overridden) {
    dateControl.durationMinutes = row.date_control_duration_minutes;
    hasAnyField = true;
  }

  if (row.date_control_password_overridden) {
    dateControl.password = row.date_control_password;
    hasAnyField = true;
  }

  if (row.date_control_early_deadlines_overridden) {
    dateControl.earlyDeadlines =
      row.early_deadlines?.map((d) => ({
        date: d.date,
        credit: d.credit,
      })) ?? null;
    hasAnyField = true;
  }

  if (row.date_control_late_deadlines_overridden) {
    dateControl.lateDeadlines =
      row.late_deadlines?.map((d) => ({
        date: d.date,
        credit: d.credit,
      })) ?? null;
    hasAnyField = true;
  }

  {
    const includeCredit = row.date_control_after_last_deadline_credit_overridden;
    const includeAllowSubmissions = row.date_control_after_last_deadline_allow_submissions != null;

    if (includeCredit || includeAllowSubmissions) {
      if (
        row.date_control_after_last_deadline_credit_overridden &&
        row.date_control_after_last_deadline_credit == null &&
        row.date_control_after_last_deadline_allow_submissions == null
      ) {
        dateControl.afterLastDeadline = null;
      } else {
        dateControl.afterLastDeadline = {};
        if (row.date_control_after_last_deadline_credit != null) {
          dateControl.afterLastDeadline.credit = row.date_control_after_last_deadline_credit;
        }
        if (includeAllowSubmissions) {
          dateControl.afterLastDeadline.allowSubmissions =
            row.date_control_after_last_deadline_allow_submissions!;
        }
      }
      hasAnyField = true;
    }
  }

  return hasAnyField ? dateControl : undefined;
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

  if (!isOverride(row)) {
    rule.listBeforeRelease = row.list_before_release ?? false;
  }

  const dateControl = buildDateControl(row);
  if (dateControl !== undefined) rule.dateControl = dateControl;

  const afterComplete = buildAfterComplete(row);
  if (afterComplete !== undefined) rule.afterComplete = afterComplete;

  // Integrations are only on main rules (number 0)
  const prairietestExamsRaw = (!isOverride(row) && row.prairietest_exams) || [];
  const prairietestExams = prairietestExamsRaw.map((e) => ({
    uuid: e.uuid,
    readOnly: e.read_only,
  }));
  if (prairietestExams.length > 0) {
    rule.integrations = {
      prairieTest: {
        exams: prairietestExams.map((e) => ({ examUuid: e.uuid, readOnly: e.readOnly })),
      },
    };
  }

  return {
    rule,
    number: row.number,
    targetType: row.target_type,
    enrollmentIds: row.enrollment_ids,
    studentLabelIds: row.student_label_ids,
    prairietestExams,
  };
}

export async function selectAccessControlRulesForAssessment(
  assessment: Assessment,
): Promise<AccessControlRuleInput[]> {
  const rows = await queryRows(
    sql.select_access_control_rules_for_assessment,
    { assessment_id: assessment.id },
    AccessControlRuleRowSchema,
  );
  return rows.map(rowToAccessControlRuleInput);
}

export async function selectAccessControlRulesForCourseInstance(
  courseInstance: CourseInstance,
): Promise<Map<string, AccessControlRuleInput[]>> {
  const rows = await queryRows(
    sql.select_access_control_rules_for_course_instance,
    { course_instance_id: courseInstance.id },
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
  courseInstance: CourseInstance,
): Promise<StudentContext> {
  const row = await queryOptionalRow(
    sql.select_student_context,
    { user_id: userId, course_instance_id: courseInstance.id },
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

export async function selectPrairieTestReservations(
  userId: string,
  date: Date,
): Promise<PrairieTestReservation[]> {
  const rows = await queryRows(
    sql.select_prairietest_reservation,
    { user_id: userId, date },
    PrairieTestReservationRowSchema,
  );
  return rows.map((row) => ({
    examUuid: row.exam_uuid,
    accessEnd: row.access_end,
  }));
}
