import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import type { AccessControlJsonWithId } from '../pages/instructorAssessmentAccess/components/types.js';
import type { AccessControlJson } from '../schemas/accessControl.js';

import {
  type Assessment,
  AssessmentAccessControlPrairietestExamSchema,
  AssessmentAccessControlRuleSchema,
} from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const AccessControlRuleBaseSchema = AssessmentAccessControlRuleSchema.omit({
  assessment_id: true,
});

const DeadlineArraySchema = z.array(z.object({ date: z.string(), credit: z.number() })).nullable();

const RuleRowSchema = AccessControlRuleBaseSchema.extend({
  target_type: z.enum(['none', 'student_label']),
  labels: z.array(z.string()).nullable(),
  early_deadlines: DeadlineArraySchema,
  late_deadlines: DeadlineArraySchema,
  prairietest_exams: z
    .array(AssessmentAccessControlPrairietestExamSchema.pick({ uuid: true, read_only: true }))
    .nullable(),
});

type RuleRow = z.infer<typeof RuleRowSchema>;

/**
 * Reverses the mapField() logic from sync/fromDisk/accessControl.ts:
 * - overridden: false → undefined (inherit)
 * - overridden: true, value: null → null (explicitly overridden to unset)
 * - overridden: true, value: V → V
 */
function unmapField<T>(overridden: boolean, value: T | null): T | null | undefined {
  if (!overridden) return undefined;
  return value;
}

type BaseRuleRow = z.infer<typeof AccessControlRuleBaseSchema> & {
  early_deadlines: z.infer<typeof DeadlineArraySchema>;
  late_deadlines: z.infer<typeof DeadlineArraySchema>;
};

function dbBaseRowToAccessControlJson(row: BaseRuleRow): AccessControlJson & { id: string } {
  const dateControl: AccessControlJson['dateControl'] = {};

  if (row.date_control_release_date_overridden) {
    dateControl.releaseDate = row.date_control_release_date?.toISOString() ?? null;
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
    if (
      row.date_control_after_last_deadline_credit_overridden &&
      row.date_control_after_last_deadline_credit == null &&
      row.date_control_after_last_deadline_allow_submissions == null
    ) {
      dateControl.afterLastDeadline = null;
    } else {
      dateControl.afterLastDeadline = {
        credit:
          unmapField(
            row.date_control_after_last_deadline_credit_overridden,
            row.date_control_after_last_deadline_credit,
          ) ?? undefined,
        allowSubmissions: row.date_control_after_last_deadline_allow_submissions ?? undefined,
      };
    }
  }
  if (row.date_control_duration_minutes_overridden) {
    dateControl.durationMinutes = row.date_control_duration_minutes;
  }
  if (row.date_control_password_overridden) {
    dateControl.password = row.date_control_password;
  }

  const afterComplete: AccessControlJson['afterComplete'] = {};
  if (row.after_complete_hide_questions !== null) {
    afterComplete.hideQuestions = row.after_complete_hide_questions;
  }
  if (row.after_complete_show_questions_again_date_overridden) {
    afterComplete.showQuestionsAgainDate =
      row.after_complete_show_questions_again_date?.toISOString();
  }
  if (row.after_complete_hide_questions_again_date_overridden) {
    afterComplete.hideQuestionsAgainDate =
      row.after_complete_hide_questions_again_date?.toISOString();
  }
  if (row.after_complete_hide_score !== null) {
    afterComplete.hideScore = row.after_complete_hide_score;
  }
  if (row.after_complete_show_score_again_date_overridden) {
    afterComplete.showScoreAgainDate = row.after_complete_show_score_again_date?.toISOString();
  }

  const isMainRule = row.number === 0 && row.target_type === 'none';
  const listBeforeRelease = isMainRule
    ? (row.list_before_release ?? false)
    : row.list_before_release;

  return {
    id: row.id,
    ...(listBeforeRelease != null ? { listBeforeRelease } : {}),
    dateControl: Object.keys(dateControl).length > 0 ? dateControl : undefined,
    afterComplete: Object.keys(afterComplete).length > 0 ? afterComplete : undefined,
  };
}

function dbRowToAccessControlJson(row: RuleRow): AccessControlJson & { id: string } {
  const base = dbBaseRowToAccessControlJson(row);
  const labels = row.labels ?? [];

  const integrations: AccessControlJson['integrations'] = {};
  if (row.prairietest_exams) {
    integrations.prairieTest = {
      exams: row.prairietest_exams.map((e) => ({
        examUuid: e.uuid,
        readOnly: e.read_only,
      })),
    };
  }

  return {
    ...base,
    labels: labels.length > 0 ? labels : undefined,
    integrations: Object.keys(integrations).length > 0 ? integrations : undefined,
  };
}

type AccessControlJsonWithRequiredId = Required<Pick<AccessControlJsonWithId, 'id'>> &
  AccessControlJsonWithId;

const EnrollmentRuleRowSchema = AccessControlRuleBaseSchema.extend({
  target_type: z.literal('enrollment'),
  enrollments: z
    .array(
      z.object({
        enrollment_id: z.string(),
        uid: z.string(),
        name: z.string().nullable(),
      }),
    )
    .nullable(),
  early_deadlines: DeadlineArraySchema,
  late_deadlines: DeadlineArraySchema,
});

type EnrollmentRuleRow = z.infer<typeof EnrollmentRuleRowSchema>;

function dbEnrollmentRowToAccessControlJson(
  row: EnrollmentRuleRow,
): AccessControlJsonWithRequiredId {
  const base = dbBaseRowToAccessControlJson(row);
  return {
    ...base,
    ruleType: 'enrollment',
    individuals: (row.enrollments ?? []).map((e) => ({
      enrollmentId: e.enrollment_id,
      uid: e.uid,
      name: e.name,
    })),
  };
}

async function fetchAccessControlJsonRules(
  assessment: Assessment,
): Promise<(AccessControlJson & { id: string })[]> {
  const rows = await queryRows(
    sql.select_all_json_rules,
    { assessment_id: assessment.id },
    RuleRowSchema,
  );
  return rows.map(dbRowToAccessControlJson);
}

async function fetchEnrollmentRules(
  assessment: Assessment,
): Promise<AccessControlJsonWithRequiredId[]> {
  const rows = await queryRows(
    sql.select_all_enrollment_rules,
    { assessment_id: assessment.id },
    EnrollmentRuleRowSchema,
  );
  return rows.map(dbEnrollmentRowToAccessControlJson);
}

export async function fetchAllAccessControlRules(
  assessment: Assessment,
): Promise<AccessControlJsonWithRequiredId[]> {
  const [jsonRules, enrollmentRules] = await Promise.all([
    fetchAccessControlJsonRules(assessment),
    fetchEnrollmentRules(assessment),
  ]);
  return [...jsonRules, ...enrollmentRules];
}
