import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import type { AccessControlJsonWithId as SharedAccessControlJsonWithId } from '../pages/instructorAssessmentAccess/components/types.js';
import type { AccessControlJson } from '../schemas/accessControl.js';

import { type Assessment, AssessmentAccessControlSchema } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const AccessControlRuleBaseSchema = AssessmentAccessControlSchema.omit({
  assessment_id: true,
  course_instance_id: true,
});

const DeadlineArraySchema = z.array(z.object({ date: z.string(), credit: z.number() })).nullable();

const JsonRuleRowSchema = AccessControlRuleBaseSchema.extend({
  target_type: z.enum(['none', 'student_label']),
  labels: z.array(z.string()).nullable(),
  early_deadlines: DeadlineArraySchema,
  late_deadlines: DeadlineArraySchema,
  prairietest_exams: z
    .array(z.object({ examUuid: z.string(), readOnly: z.boolean().nullable() }))
    .nullable(),
});

type JsonRuleRow = z.infer<typeof JsonRuleRowSchema>;

/**
 * Reverses the mapField() logic from sync/fromDisk/accessControl.ts:
 * - overridden: false → undefined (inherit)
 * - overridden: true, value: null → null (explicitly overridden to unset)
 * - overridden: true, value: V → V
 */
function unmapField<T>(overridden: boolean, value: T | null): T | null | undefined {
  if (!overridden) return undefined;
  if (value === null) return null;
  return value;
}

function toISOStringOrUndefined(overridden: boolean, date: Date | null): string | undefined {
  if (!overridden || date === null) return undefined;
  return date.toISOString();
}

type BaseRuleRow = z.infer<typeof AccessControlRuleBaseSchema> & {
  early_deadlines: z.infer<typeof DeadlineArraySchema>;
  late_deadlines: z.infer<typeof DeadlineArraySchema>;
};

function dbBaseRowToAccessControlJson(row: BaseRuleRow): AccessControlJson & { id: string } {
  const dateControl: AccessControlJson['dateControl'] = {};

  if (row.date_control_overridden) {
    dateControl.enabled = true;
  }

  if (row.date_control_release_date_overridden) {
    dateControl.releaseDate = row.date_control_release_date?.toISOString();
  }
  if (row.date_control_due_date_overridden) {
    dateControl.dueDate = row.date_control_due_date?.toISOString() ?? null;
  }
  if (row.date_control_early_deadlines_overridden) {
    dateControl.earlyDeadlines = row.early_deadlines ?? [];
  }
  if (row.date_control_late_deadlines_overridden) {
    dateControl.lateDeadlines = row.late_deadlines ?? [];
  }
  if (
    row.date_control_after_last_deadline_credit_overridden ||
    row.date_control_after_last_deadline_allow_submissions !== null
  ) {
    dateControl.afterLastDeadline = {
      credit:
        unmapField(
          row.date_control_after_last_deadline_credit_overridden,
          row.date_control_after_last_deadline_credit,
        ) ?? undefined,
      allowSubmissions: row.date_control_after_last_deadline_allow_submissions ?? undefined,
    };
  }
  if (row.date_control_duration_minutes_overridden) {
    dateControl.durationMinutes = row.date_control_duration_minutes ?? undefined;
  }
  if (row.date_control_password_overridden) {
    dateControl.password = row.date_control_password;
  }

  const afterComplete: AccessControlJson['afterComplete'] = {};
  if (row.after_complete_hide_questions !== null) {
    afterComplete.hideQuestions = row.after_complete_hide_questions;
  }
  if (row.after_complete_show_questions_again_date_overridden) {
    afterComplete.showQuestionsAgainDate = toISOStringOrUndefined(
      true,
      row.after_complete_show_questions_again_date,
    );
  }
  if (row.after_complete_hide_questions_again_date_overridden) {
    afterComplete.hideQuestionsAgainDate = toISOStringOrUndefined(
      true,
      row.after_complete_hide_questions_again_date,
    );
  }
  if (row.after_complete_hide_score !== null) {
    afterComplete.hideScore = row.after_complete_hide_score;
  }
  if (row.after_complete_show_score_again_date_overridden) {
    afterComplete.showScoreAgainDate = toISOStringOrUndefined(
      true,
      row.after_complete_show_score_again_date,
    );
  }

  return {
    id: row.id,
    enabled: row.enabled ?? undefined,
    blockAccess: row.block_access,
    listBeforeRelease: row.list_before_release,
    dateControl: Object.keys(dateControl).length > 0 ? dateControl : undefined,
    afterComplete: Object.keys(afterComplete).length > 0 ? afterComplete : undefined,
  };
}

function dbRowToAccessControlJson(row: JsonRuleRow): AccessControlJson & { id: string } {
  const base = dbBaseRowToAccessControlJson(row);
  const labels = row.labels ?? [];

  const integrations: AccessControlJson['integrations'] = {};
  if (row.integrations_prairietest_overridden && row.prairietest_exams) {
    integrations.prairieTest = {
      enabled: true,
      exams: row.prairietest_exams.map((e) => ({
        examUuid: e.examUuid,
        readOnly: e.readOnly ?? undefined,
      })),
    };
  }

  return {
    ...base,
    labels: labels.length > 0 ? labels : undefined,
    integrations: Object.keys(integrations).length > 0 ? integrations : undefined,
  };
}

type AccessControlJsonWithId = Required<Pick<SharedAccessControlJsonWithId, 'id'>> &
  SharedAccessControlJsonWithId;

const EnrollmentRuleRowSchema = AccessControlRuleBaseSchema.extend({
  target_type: z.literal('enrollment'),
  enrollments: z
    .array(
      z.object({
        enrollmentId: z.string(),
        uid: z.string(),
        name: z.string().nullable(),
      }),
    )
    .nullable(),
  early_deadlines: DeadlineArraySchema,
  late_deadlines: DeadlineArraySchema,
});

type EnrollmentRuleRow = z.infer<typeof EnrollmentRuleRowSchema>;

function dbEnrollmentRowToAccessControlJson(row: EnrollmentRuleRow): AccessControlJsonWithId {
  const base = dbBaseRowToAccessControlJson(row);
  return {
    ...base,
    ruleType: 'enrollment',
    individuals: row.enrollments ?? [],
  };
}

export async function fetchAccessControlJsonRules(
  assessment: Assessment,
): Promise<(AccessControlJson & { id: string })[]> {
  const rows = await queryRows(
    sql.select_all_json_rules,
    { assessment_id: assessment.id },
    JsonRuleRowSchema,
  );
  return rows.map(dbRowToAccessControlJson);
}

export async function fetchEnrollmentRules(
  assessment: Assessment,
): Promise<AccessControlJsonWithId[]> {
  const rows = await queryRows(
    sql.select_all_enrollment_rules,
    { assessment_id: assessment.id },
    EnrollmentRuleRowSchema,
  );
  return rows.map(dbEnrollmentRowToAccessControlJson);
}

export async function fetchAllAccessControlRules(
  assessment: Assessment,
): Promise<AccessControlJsonWithId[]> {
  const [jsonRules, enrollmentRules] = await Promise.all([
    fetchAccessControlJsonRules(assessment),
    fetchEnrollmentRules(assessment),
  ]);
  return [...jsonRules, ...enrollmentRules];
}
