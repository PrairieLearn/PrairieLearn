import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { StudentLabelSchema } from '../../lib/db-types.js';
import type { AccessControlJson } from '../../schemas/accessControl.js';
import type { CourseInstanceData } from '../course-db.js';
import * as infofile from '../infofile.js';

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

/**
 * Validates constraints that require database state: student label existence
 * and PrairieTest exam UUID existence.
 */
function validateAssessmentRules(
  rules: AccessControlJson[],
  studentLabelIdByName: Map<string, string>,
  invalidExamUuids: Set<string>,
): string | null {
  if (rules.length === 0) return null;

  // When the course instance config is invalid, student label syncing is
  // skipped, so labels that appear valid in JSON may not exist in the DB.
  // Reject them here to prevent label-targeted rules from being silently
  // treated as default rules.
  for (const rule of rules) {
    const ruleLabels = rule.labels ?? [];
    const invalidLabels = ruleLabels.filter((label) => !studentLabelIdByName.has(label));
    if (invalidLabels.length > 0) {
      return `Invalid student label(s): ${invalidLabels.join(', ')}.`;
    }
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
  const isDefaultRule = ruleNumber === JSON_RULE_START;

  const beforeReleaseListed = mapField(rule.beforeRelease?.listed);
  const dueField = mapField(dateControl.due);
  const earlyDeadlinesField = mapField(dateControl.earlyDeadlines);
  const lateDeadlinesField = mapField(dateControl.lateDeadlines);
  const durationMinutesField = mapField(dateControl.durationMinutes);
  const passwordField = mapField(dateControl.password);
  // Only materialize the default `afterLastDeadline: false` when date control
  // actually exists. Otherwise `null` keeps the date-control section absent.
  const defaultRuleHasDateControl = isDefaultRule && dateControl.release != null;
  const afterLastDeadlineAllowSubmissions =
    afterLastDeadline?.allowSubmissions ?? (defaultRuleHasDateControl ? false : null);
  const questionsHiddenField = mapField(afterComplete.questions?.hidden);
  const scoreHiddenField = mapField(afterComplete.score?.hidden);

  const ruleLabels = rule.labels ?? [];
  const studentLabelIds = ruleLabels
    .map((label) => studentLabelIdByName.get(label))
    .filter((id): id is string => id !== undefined);

  const targetType: 'none' | 'student_label' = isDefaultRule ? 'none' : 'student_label';

  const ruleRow = JSON.stringify({
    assessment_id: assessmentId,
    number: ruleNumber,
    // beforeRelease.listed is only configurable on the default rule.
    before_release_listed: isDefaultRule ? (beforeReleaseListed.value ?? false) : null,
    target_type: targetType,
    date_control_release_date: dateControl.release?.date ?? null,
    date_control_due_overridden: dueField.overridden,
    date_control_due_date: dueField.value?.date ?? null,
    date_control_due_credit: dueField.value?.credit ?? null,
    date_control_early_deadlines_overridden: earlyDeadlinesField.overridden,
    date_control_late_deadlines_overridden: lateDeadlinesField.overridden,
    date_control_after_last_deadline_allow_submissions: afterLastDeadlineAllowSubmissions,
    date_control_after_last_deadline_credit:
      afterLastDeadline?.allowSubmissions === true ? afterLastDeadline.credit : null,
    date_control_duration_minutes_overridden: durationMinutesField.overridden,
    date_control_duration_minutes: durationMinutesField.value,
    date_control_password_overridden: passwordField.overridden,
    date_control_password: passwordField.value,
    after_complete_questions_hidden: questionsHiddenField.value,
    after_complete_questions_visible_from_date: afterComplete.questions?.visibleFromDate ?? null,
    after_complete_questions_visible_until_date: afterComplete.questions?.visibleUntilDate ?? null,
    after_complete_score_hidden: scoreHiddenField.value,
    after_complete_score_visible_from_date: afterComplete.score?.visibleFromDate ?? null,
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
    JSON.stringify([
      assessmentId,
      ruleNumber,
      e.examUuid,
      e.readOnly ?? false,
      e.afterComplete?.questions?.hidden ?? false,
      e.afterComplete?.score?.hidden ?? false,
    ]),
  );

  return { ruleRow, studentLabels, earlyDeadlines, lateDeadlines, prairietestExams };
}

export interface AccessControlSyncInput {
  assessmentId: string;
  rules: AccessControlJson[];
}

async function selectStudentLabelIdByName(courseInstanceId: string): Promise<Map<string, string>> {
  const existingLabels = await sqldb.queryRows(
    sql.select_student_labels,
    { course_instance_id: courseInstanceId },
    StudentLabelSchema,
  );
  return new Map(existingLabels.map((g) => [g.name, g.id]));
}

async function selectInvalidExamUuids(
  assessments: { rules: AccessControlJson[] }[],
): Promise<Set<string>> {
  const invalidExamUuids = new Set<string>();
  if (!config.checkAccessRulesExamUuid) return invalidExamUuids;

  const allExamUuids = new Set<string>();
  for (const { rules } of assessments) {
    for (const rule of rules) {
      for (const e of rule.integrations?.prairieTest?.exams ?? []) {
        if (z.uuid().safeParse(e.examUuid).success) {
          allExamUuids.add(e.examUuid);
        }
      }
    }
  }

  if (allExamUuids.size === 0) return invalidExamUuids;

  const examValidation = await sqldb.queryRows(
    sql.check_exam_uuids_exist,
    { exam_uuids: JSON.stringify([...allExamUuids]) },
    z.object({ uuid: z.string(), uuid_exists: z.boolean() }),
  );
  for (const { uuid, uuid_exists } of examValidation) {
    if (!uuid_exists) invalidExamUuids.add(uuid);
  }

  return invalidExamUuids;
}

/**
 * Validates access-control constraints that depend on synced database rows and
 * records any resulting errors on assessment infofiles. This must run after
 * course instances and student labels are synced, but before assessments are
 * synced, so `assessments.sync_errors` includes these errors.
 */
export async function validateAccessControl(
  courseInstanceId: string,
  assessments: CourseInstanceData['assessments'],
): Promise<void> {
  const validationTargets: { tid: string; rules: AccessControlJson[] }[] = [];
  for (const [tid, assessment] of Object.entries(assessments)) {
    if (infofile.hasErrors(assessment) || !assessment.data?.accessControl?.length) continue;
    validationTargets.push({ tid, rules: assessment.data.accessControl });
  }
  if (validationTargets.length === 0) return;

  const studentLabelIdByName = await selectStudentLabelIdByName(courseInstanceId);
  const invalidExamUuids = await selectInvalidExamUuids(validationTargets);

  for (const { tid, rules } of validationTargets) {
    const error = validateAssessmentRules(rules, studentLabelIdByName, invalidExamUuids);
    if (error) {
      infofile.addError(assessments[tid], error);
    }
  }
}

/**
 * Syncs access control rules for multiple assessments in a single sproc call.
 * Inputs must already have been checked with `validateAccessControl()`.
 */
export async function syncAccessControl(
  courseInstanceId: string,
  assessments: AccessControlSyncInput[],
): Promise<void> {
  if (assessments.length === 0) return;

  const studentLabelIdByName = await selectStudentLabelIdByName(courseInstanceId);
  const assessmentIds: string[] = [];
  const allRuleRows: string[] = [];
  const allStudentLabels: string[] = [];
  const allEarlyDeadlines: string[] = [];
  const allLateDeadlines: string[] = [];
  const allPrairietestExams: string[] = [];

  for (const { assessmentId, rules } of assessments) {
    assessmentIds.push(assessmentId);

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
      assessmentIds,
      allRuleRows,
      allStudentLabels,
      allEarlyDeadlines,
      allLateDeadlines,
      allPrairietestExams,
    ],
    z.unknown(),
  );
}
