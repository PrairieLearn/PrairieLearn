import { z } from 'zod';

import {
  callScalar,
  execute,
  loadSqlEquiv,
  queryRows,
  queryScalar,
  queryScalars,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type Assessment,
  AssessmentAccessControlPrairietestExamSchema,
  AssessmentAccessControlRuleSchema,
} from '../lib/db-types.js';
import { lockEnrollments } from '../lib/enrollment/lock.js';
import { parseLocalDateTime } from '../lib/timezones.js';
import type { AccessControlJson } from '../schemas/accessControl.js';

import { lockAssessment } from './assessment.js';
import { selectCourseInstanceById } from './course-instances.js';

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
  beforeReleaseListed: boolean | null;
  releaseDate: string | null;
  dueOverridden: boolean;
  dueDate: string | null;
  dueCredit: number | null;
  earlyDeadlinesOverridden: boolean;
  lateDeadlinesOverridden: boolean;
  afterLastDeadlineAllowSubmissions: boolean | null;
  afterLastDeadlineCredit: number | null;
  durationMinutesOverridden: boolean;
  durationMinutes: number | null;
  passwordOverridden: boolean;
  password: string | null;
  questionsHidden: boolean | null;
  questionsVisibleFromDate: string | null;
  questionsVisibleUntilDate: string | null;
  scoreHidden: boolean | null;
  scoreVisibleFromDate: string | null;
  earlyDeadlines: { date: string; credit: number }[];
  lateDeadlines: { date: string; credit: number }[];
}

export interface EnrollmentAccessControlRuleInput {
  ruleData: EnrollmentAccessControlRuleData;
  enrollmentIds: string[];
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
    .array(
      AssessmentAccessControlPrairietestExamSchema.pick({
        uuid: true,
        read_only: true,
        after_complete_questions_hidden: true,
        after_complete_score_hidden: true,
      }),
    )
    .nullable(),
});

function dbBaseRowToAccessControlJson(
  row: Pick<
    z.infer<typeof RuleRowSchema>,
    'access_control_rule' | 'early_deadlines' | 'late_deadlines'
  >,
): AccessControlJsonWithRequiredId {
  const rule = row.access_control_rule;
  const isDefaultRule = rule.number === 0 && rule.target_type === 'none';

  const dateControl: AccessControlJson['dateControl'] = {};
  if (rule.date_control_release_date) {
    dateControl.release = { date: rule.date_control_release_date.toISOString() };
  }
  if (rule.date_control_due_overridden) {
    dateControl.due = {
      date: rule.date_control_due_date?.toISOString() ?? null,
      ...(rule.date_control_due_credit != null ? { credit: rule.date_control_due_credit } : {}),
    };
  }
  if (rule.date_control_early_deadlines_overridden) {
    dateControl.earlyDeadlines = row.early_deadlines ?? [];
  }
  if (rule.date_control_late_deadlines_overridden) {
    dateControl.lateDeadlines = row.late_deadlines ?? [];
  }
  const allowSubmissions = rule.date_control_after_last_deadline_allow_submissions;
  if (allowSubmissions === true) {
    const credit = rule.date_control_after_last_deadline_credit;
    dateControl.afterLastDeadline = {
      allowSubmissions,
      credit: credit ?? 0,
    };
  } else if (allowSubmissions === false && !isDefaultRule) {
    dateControl.afterLastDeadline = { allowSubmissions };
  }
  if (rule.date_control_duration_minutes_overridden) {
    dateControl.durationMinutes = rule.date_control_duration_minutes;
  }
  if (rule.date_control_password_overridden) {
    dateControl.password = rule.date_control_password;
  }

  const qHidden = rule.after_complete_questions_hidden;
  const qVisibleFromDate = rule.after_complete_questions_visible_from_date?.toISOString() ?? null;
  const qVisibleUntilDate = rule.after_complete_questions_visible_until_date?.toISOString() ?? null;

  type QuestionsJson = NonNullable<NonNullable<AccessControlJson['afterComplete']>['questions']>;
  let questions: QuestionsJson | undefined;
  if (qHidden === null) {
    questions = undefined;
  } else if (qHidden === false) {
    questions = { hidden: false as const };
  } else if (qVisibleFromDate) {
    questions = {
      hidden: true as const,
      visibleFromDate: qVisibleFromDate,
      ...(qVisibleUntilDate ? { visibleUntilDate: qVisibleUntilDate } : {}),
    };
  } else {
    questions = { hidden: true as const };
  }

  type ScoreJson = NonNullable<NonNullable<AccessControlJson['afterComplete']>['score']>;
  let score: ScoreJson | undefined;
  const sHidden = rule.after_complete_score_hidden;
  const sVisibleFromDate = rule.after_complete_score_visible_from_date?.toISOString() ?? null;

  if (sHidden === null) {
    score = undefined;
  } else if (sHidden === false) {
    score = { hidden: false as const };
  } else if (sVisibleFromDate) {
    score = { hidden: true as const, visibleFromDate: sVisibleFromDate };
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

  const beforeReleaseListed = isDefaultRule
    ? (rule.before_release_listed ?? false)
    : rule.before_release_listed;

  return {
    id: rule.id,
    ...(rule.uuid != null ? { uuid: rule.uuid } : {}),
    number: rule.number,
    ...(beforeReleaseListed != null ? { beforeRelease: { listed: beforeReleaseListed } } : {}),
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
      exams: row.prairietest_exams.map((e) => {
        const afterComplete: { questions?: { hidden: true }; score?: { hidden: true } } = {};
        if (e.after_complete_questions_hidden) {
          afterComplete.questions = { hidden: true };
        }
        if (e.after_complete_score_hidden) {
          afterComplete.score = { hidden: true };
        }
        return {
          examUuid: e.uuid,
          readOnly: e.read_only,
          ...(Object.keys(afterComplete).length > 0 ? { afterComplete } : {}),
        };
      }),
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
  targetTypes: AccessControlTargetType[],
): Promise<AccessControlJsonWithRequiredId[]> {
  const rows = await queryRows(
    sql.select_access_control_rules,
    { assessment_id: assessment.id, target_types: targetTypes },
    RuleRowSchema,
  );
  return rows.map(dbRowToAccessControlJson);
}

export async function countEnrollmentAccessControlRules(assessment: Assessment): Promise<number> {
  return await queryScalar(
    sql.count_enrollment_access_control_rules,
    { assessment_id: assessment.id },
    z.number(),
  );
}

async function selectEnrollmentAccessControlTargetIds(assessment: Assessment): Promise<string[]> {
  return await queryScalars(
    sql.select_enrollment_access_control_target_ids,
    { assessment_id: assessment.id },
    IdSchema,
  );
}

const PrairieTestExamMetadataSchema = z.object({
  uuid: z.string(),
  pt_exam_id: z.string().nullable(),
  pt_exam_name: z.string().nullable(),
  pt_course_id: z.string().nullable(),
  pt_course_name: z.string().nullable(),
});
export type PrairieTestExamMetadata = z.infer<typeof PrairieTestExamMetadataSchema>;

export async function selectPrairieTestExamMetadataByUuids(
  examUuids: string[],
): Promise<PrairieTestExamMetadata[]> {
  if (examUuids.length === 0) return [];
  return await queryRows(
    sql.select_prairietest_exam_metadata_by_uuids,
    { exam_uuids: examUuids },
    PrairieTestExamMetadataSchema,
  );
}

/**
 * Creates or updates an enrollment-based access control rule (targeting individual students).
 * These rules are stored in the database with target_type = 'enrollment'.
 */
async function syncEnrollmentAccessControlRule(
  assessment: Assessment,
  ruleData: EnrollmentAccessControlRuleData,
  ruleNumber: number,
  enrollmentIds: string[],
  displayTimezone: string,
): Promise<string> {
  const ruleJson = JSON.stringify({
    id: ruleData.id ?? null,
    number: ruleNumber,
    before_release_listed: ruleData.beforeReleaseListed,
    date_control_release_date: parseLocalDateTime(ruleData.releaseDate, displayTimezone),
    date_control_due_overridden: ruleData.dueOverridden,
    date_control_due_date: parseLocalDateTime(ruleData.dueDate, displayTimezone),
    date_control_due_credit: ruleData.dueCredit,
    date_control_early_deadlines_overridden: ruleData.earlyDeadlinesOverridden,
    date_control_late_deadlines_overridden: ruleData.lateDeadlinesOverridden,
    date_control_after_last_deadline_allow_submissions: ruleData.afterLastDeadlineAllowSubmissions,
    date_control_after_last_deadline_credit:
      ruleData.afterLastDeadlineAllowSubmissions === true ? ruleData.afterLastDeadlineCredit : null,
    date_control_duration_minutes_overridden: ruleData.durationMinutesOverridden,
    date_control_duration_minutes: ruleData.durationMinutes,
    date_control_password_overridden: ruleData.passwordOverridden,
    date_control_password: ruleData.password,
    after_complete_questions_hidden: ruleData.questionsHidden,
    after_complete_questions_visible_from_date: parseLocalDateTime(
      ruleData.questionsVisibleFromDate,
      displayTimezone,
    ),
    after_complete_questions_visible_until_date: parseLocalDateTime(
      ruleData.questionsVisibleUntilDate,
      displayTimezone,
    ),
    after_complete_score_hidden: ruleData.scoreHidden,
    after_complete_score_visible_from_date: parseLocalDateTime(
      ruleData.scoreVisibleFromDate,
      displayTimezone,
    ),
  });

  const earlyDeadlinesJson = ruleData.earlyDeadlines.map((d) =>
    JSON.stringify({ date: parseLocalDateTime(d.date, displayTimezone), credit: d.credit }),
  );
  const lateDeadlinesJson = ruleData.lateDeadlines.map((d) =>
    JSON.stringify({ date: parseLocalDateTime(d.date, displayTimezone), credit: d.credit }),
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

export async function replaceEnrollmentAccessControlRules(
  assessment: Assessment,
  rules: EnrollmentAccessControlRuleInput[],
): Promise<void> {
  const courseInstance = await selectCourseInstanceById(assessment.course_instance_id);
  const submittedIds = new Set<string>();
  for (const rule of rules) {
    const id = rule.ruleData.id;
    if (id == null) continue;
    if (submittedIds.has(id)) {
      throw new Error(`Duplicate enrollment access control rule ID: ${id}`);
    }
    submittedIds.add(id);
  }

  await runInTransactionAsync(async () => {
    // Enrollment rows must be locked before the access-control rows that
    // reference them, so we cannot lock the assessment first to stabilize its
    // target set. Instead, snapshot the existing targets, lock their union with
    // the submitted targets, lock the assessment, and then verify that the
    // snapshot still covered every current target.
    //
    // For example, suppose a rule targets enrollment A and this request changes
    // it to C. After we snapshot A, reconciliation may lock A and B, move the
    // rule from A to B, and commit while this request is waiting to lock A. This
    // request would then hold A and C but not the now-current target B. Continuing
    // would mutate B's dependent rows without first locking B, violating the lock
    // order that prevents deadlocks and concurrent dependent changes.
    //
    // If that rare overlap occurs, this transaction leaves the enrollment rules
    // unchanged and the access-control UI displays the error below. JSON-backed
    // rules may already have been saved by the caller, so the instructor must
    // refresh to load both the saved JSON and current enrollment targets, then
    // retry the student-specific change.
    const existingTargetIds = await selectEnrollmentAccessControlTargetIds(assessment);
    const targetIdsToLock = new Set([
      ...existingTargetIds,
      ...rules.flatMap((rule) => rule.enrollmentIds),
    ]);
    await lockEnrollments(targetIdsToLock);
    await lockAssessment(assessment);

    const revalidatedTargetIds = await selectEnrollmentAccessControlTargetIds(assessment);
    if (revalidatedTargetIds.some((id) => !targetIdsToLock.has(id))) {
      throw new Error(
        'Student-specific access control targets changed while saving. Refresh the page and try again.',
      );
    }

    const currentRules = await selectAccessControlRules(assessment, ['enrollment']);
    const existingIds = new Set(currentRules.map((rule) => rule.id));
    const idsToDelete = [...existingIds].filter((id) => !submittedIds.has(id));
    if (idsToDelete.length > 0) {
      await execute(sql.delete_enrollment_rules_by_ids, {
        ids: idsToDelete,
        assessment_id: assessment.id,
      });
    }

    if (rules.length > 0) {
      // Reordering can swap existing rule numbers, which would otherwise violate
      // the unique constraint before the batch finishes. These temporary values
      // stay inside this transaction and are replaced by the loop below.
      await execute(sql.move_enrollment_rules_to_temporary_numbers, {
        assessment_id: assessment.id,
      });
      for (const [index, rule] of rules.entries()) {
        await syncEnrollmentAccessControlRule(
          assessment,
          rule.ruleData,
          index + 1,
          rule.enrollmentIds,
          courseInstance.display_timezone,
        );
      }
    }
  });
}
