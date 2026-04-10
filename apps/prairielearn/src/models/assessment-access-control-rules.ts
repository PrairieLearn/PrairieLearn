import { z } from 'zod';

import { callScalar, execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type Assessment,
  AssessmentAccessControlPrairietestExamSchema,
  AssessmentAccessControlRuleSchema,
} from '../lib/db-types.js';
import type { AccessControlJson } from '../schemas/accessControl.js';

const sql = loadSqlEquiv(import.meta.url);

interface AccessControlEnrollment {
  enrollmentId: string;
  uid: string;
  name: string | null;
}

export interface AccessControlJsonWithId extends AccessControlJson {
  /** Database ID (undefined for new/unsaved rules) */
  id?: string;
  /** Database rule number for sorting */
  number?: number;
  /** Rule type: 'student_label' for label-based rules, 'enrollment' for individual student rules, 'none' for rules without specific targeting */
  ruleType?: 'student_label' | 'enrollment' | 'none' | null;
  enrollments?: AccessControlEnrollment[];
  /** Student label details (id, name, color) from the database, used for rendering colored badges. */
  labelDetails?: { id: string; name: string; color: string }[];
}

type AccessControlJsonWithRequiredId = Required<Pick<AccessControlJsonWithId, 'id'>> &
  AccessControlJsonWithId;

export interface EnrollmentAccessControlRuleData {
  id?: string;
  listBeforeRelease: boolean | null;
  releaseDate: string | null;
  dueDateOverridden: boolean;
  dueDate: string | null;
  earlyDeadlinesOverridden: boolean;
  lateDeadlinesOverridden: boolean;
  afterLastDeadlineAllowSubmissions: boolean | null;
  afterLastDeadlineCreditOverridden: boolean;
  afterLastDeadlineCredit: number | null;
  durationMinutesOverridden: boolean;
  durationMinutes: number | null;
  passwordOverridden: boolean;
  password: string | null;
  questionsHidden: boolean | null;
  questionsVisibleFromOverridden: boolean;
  questionsVisibleFrom: string | null;
  questionsVisibleUntilOverridden: boolean;
  questionsVisibleUntil: string | null;
  scoreHidden: boolean | null;
  scoreVisibleFromOverridden: boolean;
  scoreVisibleFrom: string | null;
  earlyDeadlines: { date: string; credit: number }[];
  lateDeadlines: { date: string; credit: number }[];
}

type AccessControlTargetType = 'none' | 'student_label' | 'enrollment';

const DeadlineArraySchema = z.array(z.object({ date: z.string(), credit: z.number() })).nullable();

const LabelDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

const RuleRowSchema = z.object({
  access_control_rule: AssessmentAccessControlRuleSchema.extend({
    target_type: z.enum(['none', 'student_label', 'enrollment']),
  }),
  labels: z.array(LabelDetailSchema).nullable(),
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
  prairietest_exams: z
    .array(AssessmentAccessControlPrairietestExamSchema.pick({ uuid: true, read_only: true }))
    .nullable(),
});

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

function dbBaseRowToAccessControlJson(
  row: Pick<
    z.infer<typeof RuleRowSchema>,
    'access_control_rule' | 'early_deadlines' | 'late_deadlines'
  >,
): AccessControlJson & { id: string } {
  const rule = row.access_control_rule;
  const dateControl: AccessControlJson['dateControl'] = {};

  if (rule.date_control_release_date) {
    dateControl.releaseDate = rule.date_control_release_date.toISOString();
  }
  if (rule.date_control_due_date_overridden) {
    dateControl.dueDate = rule.date_control_due_date?.toISOString() ?? null;
  }
  if (rule.date_control_early_deadlines_overridden) {
    dateControl.earlyDeadlines = row.early_deadlines ?? [];
  }
  if (rule.date_control_late_deadlines_overridden) {
    dateControl.lateDeadlines = row.late_deadlines ?? [];
  }
  const allowSubmissions = rule.date_control_after_last_deadline_allow_submissions;
  if (allowSubmissions === true) {
    dateControl.afterLastDeadline = {
      allowSubmissions,
      credit: unmapField(
        rule.date_control_after_last_deadline_credit_overridden,
        rule.date_control_after_last_deadline_credit,
      ),
    };
  } else if (allowSubmissions === false) {
    dateControl.afterLastDeadline = { allowSubmissions };
  }
  if (rule.date_control_duration_minutes_overridden) {
    dateControl.durationMinutes = rule.date_control_duration_minutes;
  }
  if (rule.date_control_password_overridden) {
    dateControl.password = rule.date_control_password;
  }

  const qHidden = rule.after_complete_questions_hidden;
  const qVisibleFrom = rule.after_complete_questions_visible_from_overridden
    ? (rule.after_complete_questions_visible_from?.toISOString() ?? null)
    : undefined;
  const qVisibleUntil = rule.after_complete_questions_visible_until_overridden
    ? (rule.after_complete_questions_visible_until?.toISOString() ?? null)
    : undefined;

  type QuestionsJson = NonNullable<NonNullable<AccessControlJson['afterComplete']>['questions']>;
  let questions: QuestionsJson | undefined;
  if (qHidden === null) {
    // No hidden set — override inheriting from main rule.
    if (qVisibleFrom != null && qVisibleFrom.length > 0) {
      questions = {
        visibleFrom: qVisibleFrom,
        ...(qVisibleUntil !== undefined && { visibleUntil: qVisibleUntil }),
      };
    } else if (qVisibleFrom !== undefined || qVisibleUntil !== undefined) {
      // visibleFrom is absent/null, so visibleUntil must also be null per schema.
      questions = {
        ...(qVisibleFrom !== undefined && { visibleFrom: null }),
        ...(qVisibleUntil !== undefined && { visibleUntil: null }),
      };
    }
  } else if (qHidden === false) {
    questions = { hidden: false as const };
  } else if (qVisibleFrom != null && qVisibleFrom.length > 0) {
    questions = {
      hidden: true as const,
      visibleFrom: qVisibleFrom,
      ...(qVisibleUntil !== undefined && { visibleUntil: qVisibleUntil }),
    };
  } else {
    questions = { hidden: true as const };
  }

  type ScoreJson = NonNullable<NonNullable<AccessControlJson['afterComplete']>['score']>;
  let score: ScoreJson | undefined;
  const sHidden = rule.after_complete_score_hidden;
  const sVisibleFrom = rule.after_complete_score_visible_from_overridden
    ? (rule.after_complete_score_visible_from?.toISOString() ?? null)
    : undefined;

  if (sHidden === null) {
    if (sVisibleFrom !== undefined) {
      score = { visibleFrom: sVisibleFrom };
    }
  } else if (sHidden === false) {
    score = { hidden: false as const };
  } else if (sVisibleFrom !== undefined) {
    score = { hidden: true as const, visibleFrom: sVisibleFrom };
  } else {
    score = { hidden: true as const };
  }

  const afterComplete: AccessControlJson['afterComplete'] = {};
  if (questions) {
    afterComplete.questions = questions;
  }
  if (score) {
    afterComplete.score = score;
  }

  const isMainRule = rule.number === 0 && rule.target_type === 'none';
  const listBeforeRelease = isMainRule
    ? (rule.list_before_release ?? false)
    : rule.list_before_release;

  return {
    id: rule.id,
    ...(listBeforeRelease != null ? { listBeforeRelease } : {}),
    dateControl: Object.keys(dateControl).length > 0 ? dateControl : undefined,
    afterComplete: Object.keys(afterComplete).length > 0 ? afterComplete : undefined,
  };
}

export function dbRowToAccessControlJson(
  row: z.infer<typeof RuleRowSchema>,
): AccessControlJsonWithRequiredId {
  const base = dbBaseRowToAccessControlJson(row);
  const targetType = row.access_control_rule.target_type;

  if (targetType === 'enrollment') {
    return {
      ...base,
      ruleType: 'enrollment',
      enrollments: (row.enrollments ?? []).map((e) => ({
        enrollmentId: e.enrollment_id,
        uid: e.uid,
        name: e.name,
      })),
    };
  }

  const labelDetails = row.labels ?? [];
  const integrations: AccessControlJson['integrations'] = {};
  if (row.prairietest_exams && row.prairietest_exams.length > 0) {
    integrations.prairieTest = {
      exams: row.prairietest_exams.map((e) => ({
        examUuid: e.uuid,
        readOnly: e.read_only,
      })),
    };
  }

  return {
    ...base,
    labels: labelDetails.length > 0 ? labelDetails.map((l) => l.name) : undefined,
    labelDetails: labelDetails.length > 0 ? labelDetails : undefined,
    integrations: Object.keys(integrations).length > 0 ? integrations : undefined,
  };
}

export async function selectAccessControlRules(
  assessment: Assessment,
  targetTypes: AccessControlTargetType[] = ['none', 'student_label', 'enrollment'],
): Promise<AccessControlJsonWithRequiredId[]> {
  const rows = await queryRows(
    sql.select_access_control_rules,
    { assessment_id: assessment.id, target_types: targetTypes },
    RuleRowSchema,
  );
  return rows.map(dbRowToAccessControlJson);
}

/**
 * Creates or updates an enrollment-based access control rule (targeting individual students).
 * These rules are stored in the database with target_type = 'enrollment'.
 */
export async function syncEnrollmentAccessControl(
  assessment: Assessment,
  ruleData: EnrollmentAccessControlRuleData,
  enrollmentIds: string[],
): Promise<string> {
  const ruleJson = JSON.stringify({
    id: ruleData.id ?? null,
    list_before_release: ruleData.listBeforeRelease,
    date_control_release_date: ruleData.releaseDate,
    date_control_due_date_overridden: ruleData.dueDateOverridden,
    date_control_due_date: ruleData.dueDate,
    date_control_early_deadlines_overridden: ruleData.earlyDeadlinesOverridden,
    date_control_late_deadlines_overridden: ruleData.lateDeadlinesOverridden,
    date_control_after_last_deadline_allow_submissions: ruleData.afterLastDeadlineAllowSubmissions,
    date_control_after_last_deadline_credit_overridden: ruleData.afterLastDeadlineCreditOverridden,
    date_control_after_last_deadline_credit: ruleData.afterLastDeadlineCredit,
    date_control_duration_minutes_overridden: ruleData.durationMinutesOverridden,
    date_control_duration_minutes: ruleData.durationMinutes,
    date_control_password_overridden: ruleData.passwordOverridden,
    date_control_password: ruleData.password,
    after_complete_questions_hidden: ruleData.questionsHidden,
    after_complete_questions_visible_from_overridden: ruleData.questionsVisibleFromOverridden,
    after_complete_questions_visible_from: ruleData.questionsVisibleFrom,
    after_complete_questions_visible_until_overridden: ruleData.questionsVisibleUntilOverridden,
    after_complete_questions_visible_until: ruleData.questionsVisibleUntil,
    after_complete_score_hidden: ruleData.scoreHidden,
    after_complete_score_visible_from_overridden: ruleData.scoreVisibleFromOverridden,
    after_complete_score_visible_from: ruleData.scoreVisibleFrom,
  });

  const earlyDeadlinesJson = ruleData.earlyDeadlines.map((d) =>
    JSON.stringify({ date: d.date, credit: d.credit }),
  );
  const lateDeadlinesJson = ruleData.lateDeadlines.map((d) =>
    JSON.stringify({ date: d.date, credit: d.credit }),
  );

  return callScalar(
    'sync_enrollment_access_control',
    [
      assessment.course_instance_id,
      assessment.id,
      ruleJson,
      enrollmentIds,
      earlyDeadlinesJson,
      lateDeadlinesJson,
    ],
    IdSchema,
  );
}

export async function deleteEnrollmentAccessControlsByIds(
  ids: string[],
  assessment: Assessment,
): Promise<void> {
  if (ids.length === 0) return;
  await execute(sql.delete_enrollment_rules_by_ids, {
    ids,
    assessment_id: assessment.id,
  });
}
