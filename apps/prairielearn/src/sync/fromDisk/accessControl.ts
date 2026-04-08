import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { StudentLabelSchema } from '../../lib/db-types.js';
import {
  type AccessControlJson,
  MAX_ACCESS_CONTROL_RULES,
  validateRuleCreditMonotonicity,
  validateRuleDateOrdering,
} from '../../schemas/accessControl.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Maps a JSON field value to database overridden/value pair.
 * `undefined` means "not specified" (inherit from parent rule); any other
 * value (including `null`) means "explicitly overridden".
 */
function mapField<T>(jsonValue: T | null | undefined): {
  overridden: boolean;
  value: T | null;
} {
  if (jsonValue === undefined) {
    return { overridden: false, value: null };
  }
  return { overridden: true, value: jsonValue };
}

const JSON_RULE_START = 0;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a single access control rule. Checks duplicates, date ordering,
 * credit monotonicity, and target-type constraints (e.g. integrations and
 * listBeforeRelease are only valid on the main rule).
 *
 * @param rule The access control rule to validate.
 * @param targetType 'none' for the main rule, 'student_label' or 'enrollment' for overrides.
 */
export function validateRule(
  rule: AccessControlJson,
  targetType: 'none' | 'student_label' | 'enrollment',
): string | null {
  if (targetType !== 'none') {
    if (rule.listBeforeRelease !== undefined) {
      return 'listBeforeRelease can only be specified on the defaults.';
    }
    if (rule.integrations != null) {
      return 'integrations can only be specified on the defaults.';
    }
  }

  const exams = rule.integrations?.prairieTest?.exams ?? [];
  const seenUuids = new Set<string>();
  for (const e of exams) {
    if (seenUuids.has(e.examUuid)) {
      return `Duplicate PrairieTest exam UUID: ${e.examUuid}.`;
    }
    seenUuids.add(e.examUuid);
  }

  const earlyDates = new Set<string>();
  for (const d of rule.dateControl?.earlyDeadlines ?? []) {
    if (earlyDates.has(d.date)) {
      return `Duplicate early deadline date: ${d.date}.`;
    }
    earlyDates.add(d.date);
  }

  const lateDates = new Set<string>();
  for (const d of rule.dateControl?.lateDeadlines ?? []) {
    if (lateDates.has(d.date)) {
      return `Duplicate late deadline date: ${d.date}.`;
    }
    lateDates.add(d.date);
  }

  const dateErrors = validateRuleDateOrdering(rule);
  if (dateErrors.length > 0) return dateErrors[0];

  const creditErrors = validateRuleCreditMonotonicity(rule);
  if (creditErrors.length > 0) return creditErrors[0];

  return null;
}

/**
 * Validates and prepares rules for a single assessment. Returns an error
 * string if validation fails, or null if the rules are valid.
 */
function validateAssessmentRules(
  rules: AccessControlJson[],
  studentLabelIdByName: Map<string, string>,
  invalidExamUuids: Set<string>,
): string | null {
  if (rules.length === 0) return null;

  if (rules.length > MAX_ACCESS_CONTROL_RULES) {
    return `Too many access control rules: ${rules.length}. Maximum allowed is ${MAX_ACCESS_CONTROL_RULES}.`;
  }

  // Keep label validation here even though course-db validates it earlier.
  // If the course instance config is invalid, course-db skips label existence
  // checks to avoid cascading errors, and student label syncing is skipped.
  // We still need to reject labels missing from the database here so that
  // label-targeted rules are not silently treated as main rules.
  for (const [index, rule] of rules.entries()) {
    const ruleLabels = rule.labels ?? [];
    const seenLabels = new Set<string>();
    const duplicateLabels = new Set<string>();

    for (const label of ruleLabels) {
      if (seenLabels.has(label)) {
        duplicateLabels.add(label);
      } else {
        seenLabels.add(label);
      }
    }

    if (duplicateLabels.size > 0) {
      return (
        `Duplicate student label(s): ${[...duplicateLabels].join(', ')}. ` +
        'Each label can only be targeted once per access control rule.'
      );
    }

    const invalidLabels = [...seenLabels].filter((label) => !studentLabelIdByName.has(label));
    if (invalidLabels.length > 0) {
      return `Invalid student label(s): ${invalidLabels.join(', ')}.`;
    }

    const targetType = index === 0 ? 'none' : 'student_label';
    const ruleError = validateRule(rule, targetType);
    if (ruleError) return ruleError;
  }

  const assessmentInvalidUuids: string[] = [];
  for (const rule of rules) {
    for (const e of rule.integrations?.prairieTest?.exams ?? []) {
      if (invalidExamUuids.has(e.examUuid)) {
        assessmentInvalidUuids.push(e.examUuid);
      }
    }
  }
  if (assessmentInvalidUuids.length > 0) {
    return (
      `Invalid PrairieTest exam UUID(s): ${assessmentInvalidUuids.join(', ')}. ` +
      'These UUIDs do not match any known PrairieTest exams.'
    );
  }

  return null;
}

function prepareRuleRow(
  assessmentId: string,
  ruleNumber: number,
  rule: AccessControlJson,
  studentLabelIdByName: Map<string, string>,
): {
  ruleRow: string;
  studentLabels: string[];
  earlyDeadlines: string[];
  lateDeadlines: string[];
  prairietestExams: string[];
} {
  const dateControl = rule.dateControl ?? {};
  const afterComplete = rule.afterComplete ?? {};
  const afterLastDeadline = dateControl.afterLastDeadline;
  const isMainRule = ruleNumber === JSON_RULE_START;

  const listBeforeRelease = mapField(rule.listBeforeRelease);
  const releaseDateField = mapField(dateControl.releaseDate);
  const dueDateField = mapField(dateControl.dueDate);
  const earlyDeadlinesField = mapField(dateControl.earlyDeadlines);
  const lateDeadlinesField = mapField(dateControl.lateDeadlines);
  const durationMinutesField = mapField(dateControl.durationMinutes);
  const passwordField = mapField(dateControl.password);
  const afterLastDeadlineAllowSubmissionsField = mapField(afterLastDeadline?.allowSubmissions);
  const afterLastDeadlineCreditField =
    afterLastDeadline === null ? mapField<null>(null) : mapField(afterLastDeadline?.credit);
  const hideQuestionsField = mapField(afterComplete.hideQuestions);
  const showQuestionsAgainDateField = mapField(afterComplete.showQuestionsAgainDate);
  const hideQuestionsAgainDateField = mapField(afterComplete.hideQuestionsAgainDate);
  const hideScoreField = mapField(afterComplete.hideScore);
  const showScoreAgainDateField = mapField(afterComplete.showScoreAgainDate);

  const ruleLabels = rule.labels ?? [];
  const studentLabelIds = ruleLabels
    .map((label) => studentLabelIdByName.get(label))
    .filter((id): id is string => id !== undefined);

  const targetType: 'none' | 'student_label' = isMainRule ? 'none' : 'student_label';

  const ruleRow = JSON.stringify({
    assessment_id: assessmentId,
    number: ruleNumber,
    // listBeforeRelease is only configurable on the main rule.
    list_before_release: isMainRule ? (listBeforeRelease.value ?? false) : null,
    target_type: targetType,
    date_control_release_date_overridden: releaseDateField.overridden,
    date_control_release_date: releaseDateField.value,
    date_control_due_date_overridden: dueDateField.overridden,
    date_control_due_date: dueDateField.value,
    date_control_early_deadlines_overridden: earlyDeadlinesField.overridden,
    date_control_late_deadlines_overridden: lateDeadlinesField.overridden,
    date_control_after_last_deadline_allow_submissions:
      afterLastDeadlineAllowSubmissionsField.value,
    date_control_after_last_deadline_credit_overridden: afterLastDeadlineCreditField.overridden,
    date_control_after_last_deadline_credit: afterLastDeadlineCreditField.value,
    date_control_duration_minutes_overridden: durationMinutesField.overridden,
    date_control_duration_minutes: durationMinutesField.value,
    date_control_password_overridden: passwordField.overridden,
    date_control_password: passwordField.value,
    after_complete_hide_questions: hideQuestionsField.value,
    after_complete_show_questions_again_date_overridden: showQuestionsAgainDateField.overridden,
    after_complete_show_questions_again_date: showQuestionsAgainDateField.value,
    after_complete_hide_questions_again_date_overridden: hideQuestionsAgainDateField.overridden,
    after_complete_hide_questions_again_date: hideQuestionsAgainDateField.value,
    after_complete_hide_score: hideScoreField.value,
    after_complete_show_score_again_date_overridden: showScoreAgainDateField.overridden,
    after_complete_show_score_again_date: showScoreAgainDateField.value,
  });

  // Child data arrays use [assessment_id, rule_number, ...data] format.
  // The sproc joins on (assessment_id, rule_number) to resolve the access_control_id.
  const studentLabels = studentLabelIds.map((labelId) =>
    JSON.stringify([assessmentId, ruleNumber, labelId]),
  );

  const earlyDeadlines = (earlyDeadlinesField.value ?? []).map((d) =>
    JSON.stringify([assessmentId, ruleNumber, d.date, d.credit]),
  );

  const lateDeadlines = (lateDeadlinesField.value ?? []).map((d) =>
    JSON.stringify([assessmentId, ruleNumber, d.date, d.credit]),
  );

  const exams = rule.integrations?.prairieTest?.exams ?? [];
  const prairietestExams = exams.map((e) =>
    JSON.stringify([assessmentId, ruleNumber, e.examUuid, e.readOnly ?? false]),
  );

  return { ruleRow, studentLabels, earlyDeadlines, lateDeadlines, prairietestExams };
}

export interface AccessControlSyncInput {
  assessmentId: string;
  rules: AccessControlJson[];
}

/**
 * Syncs access control rules for multiple assessments in a single sproc call.
 * Returns a map of assessmentId → error message for assessments that failed
 * validation. Assessments that fail validation are deliberately excluded from
 * the sproc call so their existing database rules are preserved. This is
 * consistent with how other sync operations handle errors: invalid new config
 * should not destroy valid existing state.
 *
 * Returns a map of assessment ID → error message for assessments that failed
 * validation. Callers should attach these to the in-memory assessment infofiles
 * via `infofile.addError()` so they appear in the sync job log (the same way
 * other late-discovered validation errors like invalid exam UUIDs are reported).
 */
export async function syncAllAccessControl(
  courseInstanceId: string,
  assessments: AccessControlSyncInput[],
): Promise<Map<string, string>> {
  const errors = new Map<string, string>();
  if (assessments.length === 0) return errors;

  // Query student labels once for the whole course instance.
  const existingLabels = await sqldb.queryRows(
    sql.select_student_labels,
    { course_instance_id: courseInstanceId },
    StudentLabelSchema,
  );
  const studentLabelIdByName = new Map(existingLabels.map((g) => [g.name, g.id]));

  // Collect all exam UUIDs across all assessments and validate once.
  const invalidExamUuids = new Set<string>();
  if (config.checkAccessRulesExamUuid) {
    const allExamUuids = new Set<string>();
    for (const { rules } of assessments) {
      for (const rule of rules) {
        for (const e of rule.integrations?.prairieTest?.exams ?? []) {
          if (UUID_REGEX.test(e.examUuid)) {
            allExamUuids.add(e.examUuid);
          }
        }
      }
    }

    if (allExamUuids.size > 0) {
      const examValidation = await sqldb.queryRows(
        sql.check_exam_uuids_exist,
        { exam_uuids: JSON.stringify([...allExamUuids]) },
        z.object({ uuid: z.string(), uuid_exists: z.boolean() }),
      );
      for (const { uuid, uuid_exists } of examValidation) {
        if (!uuid_exists) invalidExamUuids.add(uuid);
      }
    }
  }

  // Per-assessment validation.
  for (const { assessmentId, rules } of assessments) {
    const error = validateAssessmentRules(rules, studentLabelIdByName, invalidExamUuids);
    if (error) {
      errors.set(assessmentId, error);
    }
  }

  // Build batched data arrays. Assessments with validation errors are excluded
  // entirely so their existing database rules are preserved (not cleaned up).
  const validAssessmentIds: string[] = [];
  const allRuleRows: string[] = [];
  const allStudentLabels: string[] = [];
  const allEarlyDeadlines: string[] = [];
  const allLateDeadlines: string[] = [];
  const allPrairietestExams: string[] = [];

  for (const { assessmentId, rules } of assessments) {
    if (errors.has(assessmentId)) continue;
    validAssessmentIds.push(assessmentId);

    for (let i = 0; i < rules.length; i++) {
      const { ruleRow, studentLabels, earlyDeadlines, lateDeadlines, prairietestExams } =
        prepareRuleRow(assessmentId, JSON_RULE_START + i, rules[i], studentLabelIdByName);

      allRuleRows.push(ruleRow);
      allStudentLabels.push(...studentLabels);
      allEarlyDeadlines.push(...earlyDeadlines);
      allLateDeadlines.push(...lateDeadlines);
      allPrairietestExams.push(...prairietestExams);
    }
  }

  await sqldb.callRows(
    'sync_access_control',
    [
      courseInstanceId,
      validAssessmentIds,
      allRuleRows,
      allStudentLabels,
      allEarlyDeadlines,
      allLateDeadlines,
      allPrairietestExams,
    ],
    z.unknown(),
  );

  return errors;
}
