import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { StudentLabelSchema } from '../../lib/db-types.js';
import type { AccessControlJson } from '../../schemas/accessControl.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Maps a JSON field value to database overridden/value pair.
 * - undefined → overridden: false, value: null (inherit from previous rule)
 * - null → overridden: true, value: null (override and unset)
 * - value → overridden: true, value: value (override and set)
 */
function mapField<T>(jsonValue: T | null | undefined): {
  overridden: boolean;
  value: T | null;
} {
  if (jsonValue === undefined) {
    return { overridden: false, value: null };
  } else if (jsonValue === null) {
    return { overridden: true, value: null };
  } else {
    return { overridden: true, value: jsonValue };
  }
}

interface PreparedRule {
  number: number;
  enabled: boolean;
  blockAccess: boolean;
  listBeforeRelease: boolean;
  targetType: 'none' | 'student_label';
  dateControlOverridden: boolean;
  releaseDateOverridden: boolean;
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
  integrationsPrairietestOverridden: boolean;
  hideQuestions: boolean | null;
  showQuestionsAgainDateOverridden: boolean;
  showQuestionsAgainDate: string | null;
  hideQuestionsAgainDateOverridden: boolean;
  hideQuestionsAgainDate: string | null;
  hideScore: boolean | null;
  showScoreAgainDateOverridden: boolean;
  showScoreAgainDate: string | null;
  studentLabelIds: string[];
  earlyDeadlines: { date: string; credit: number }[];
  lateDeadlines: { date: string; credit: number }[];
  prairietestExams: { uuid: string; readOnly: boolean }[];
}

export async function syncAccessControl(
  courseInstanceId: string,
  assessmentId: string,
  accessControlRules: AccessControlJson[],
): Promise<void> {
  await runInTransactionAsync(async () => {
    await syncAccessControlInternal(courseInstanceId, assessmentId, accessControlRules);
  });
}

async function syncAccessControlInternal(
  courseInstanceId: string,
  assessmentId: string,
  accessControlRules: AccessControlJson[],
): Promise<void> {
  const JSON_RULE_START = 0;
  const MAX_JSON_RULES = 1000;

  if (accessControlRules.length > MAX_JSON_RULES) {
    throw new Error(
      `Too many access control rules: ${accessControlRules.length}. Maximum allowed is ${MAX_JSON_RULES}.`,
    );
  }

  const existingLabels = await sqldb.queryRows(
    sql.select_student_labels,
    { course_instance_id: courseInstanceId },
    StudentLabelSchema,
  );
  // Map by name since the JSON uses label names, not IDs
  const validLabelIds = new Map(existingLabels.map((g) => [g.name, g.id]));

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const allExamUuids = new Set<string>();
  for (const rule of accessControlRules) {
    const exams = rule.integrations?.prairieTest?.exams ?? [];
    for (const e of exams) {
      if (UUID_REGEX.test(e.examUuid)) {
        allExamUuids.add(e.examUuid);
      }
    }
  }

  const validExamUuids = new Set<string>();
  if (allExamUuids.size > 0) {
    const examValidation = await sqldb.queryRows(
      sql.check_exam_uuids_exist,
      { exam_uuids: JSON.stringify([...allExamUuids]) },
      z.object({ uuid: z.string(), uuid_exists: z.boolean() }),
    );
    for (const { uuid, uuid_exists } of examValidation) {
      if (uuid_exists) {
        validExamUuids.add(uuid);
      }
    }
  }

  for (const rule of accessControlRules) {
    const ruleLabels = rule.labels ?? [];
    const invalidLabels = ruleLabels.filter((label) => !validLabelIds.has(label));
    if (invalidLabels.length > 0) {
      throw new Error(
        `Invalid student label(s): ${invalidLabels.join(', ')}. ` +
          `Valid labels are: ${[...validLabelIds.keys()].join(', ') || '(none)'}`,
      );
    }
  }
  const validRules = accessControlRules;

  const preparedRules: PreparedRule[] = [];
  for (let i = 0; i < validRules.length; i++) {
    const rule = validRules[i];
    const dateControl = rule.dateControl ?? {};
    const afterComplete = rule.afterComplete ?? {};
    const afterLastDeadline = dateControl.afterLastDeadline ?? {};

    const enabled = mapField(rule.enabled);
    const blockAccess = mapField(rule.blockAccess);
    const listBeforeRelease = mapField(rule.listBeforeRelease);
    const releaseDateField = mapField(dateControl.releaseDate);
    const dueDateField = mapField(dateControl.dueDate);
    const earlyDeadlinesField = mapField(dateControl.earlyDeadlines);
    const lateDeadlinesField = mapField(dateControl.lateDeadlines);
    const durationMinutesField = mapField(dateControl.durationMinutes);
    const passwordField = mapField(dateControl.password);
    const afterLastDeadlineAllowSubmissionsField = mapField(afterLastDeadline.allowSubmissions);
    const afterLastDeadlineCreditField = mapField(afterLastDeadline.credit);
    const hideQuestionsField = mapField(afterComplete.hideQuestions);
    const showQuestionsAgainDateField = mapField(afterComplete.showQuestionsAgainDate);
    const hideQuestionsAgainDateField = mapField(afterComplete.hideQuestionsAgainDate);
    const hideScoreField = mapField(afterComplete.hideScore);
    const showScoreAgainDateField = mapField(afterComplete.showScoreAgainDate);

    const dateControlOverridden =
      releaseDateField.overridden ||
      dueDateField.overridden ||
      earlyDeadlinesField.overridden ||
      lateDeadlinesField.overridden ||
      durationMinutesField.overridden ||
      passwordField.overridden ||
      afterLastDeadlineAllowSubmissionsField.overridden ||
      afterLastDeadlineCreditField.overridden;

    const integrationsPrairietestOverridden = rule.integrations?.prairieTest?.exams !== undefined;

    const ruleLabels = rule.labels ?? [];
    const studentLabelIds = ruleLabels
      .map((label) => validLabelIds.get(label))
      .filter((id): id is string => id !== undefined);

    const ruleNumber = JSON_RULE_START + i;
    const targetType: 'none' | 'student_label' =
      studentLabelIds.length > 0 ? 'student_label' : 'none';

    const validExams = (rule.integrations?.prairieTest?.exams ?? []).filter((e) =>
      validExamUuids.has(e.examUuid),
    );

    preparedRules.push({
      number: ruleNumber,
      enabled: enabled.value ?? true,
      blockAccess: blockAccess.value ?? false,
      listBeforeRelease: listBeforeRelease.value ?? true,
      targetType,
      dateControlOverridden,
      releaseDateOverridden: releaseDateField.overridden,
      releaseDate: releaseDateField.value,
      dueDateOverridden: dueDateField.overridden,
      dueDate: dueDateField.value,
      earlyDeadlinesOverridden: earlyDeadlinesField.overridden,
      lateDeadlinesOverridden: lateDeadlinesField.overridden,
      afterLastDeadlineAllowSubmissions: afterLastDeadlineAllowSubmissionsField.value,
      afterLastDeadlineCreditOverridden: afterLastDeadlineCreditField.overridden,
      afterLastDeadlineCredit: afterLastDeadlineCreditField.value,
      durationMinutesOverridden: durationMinutesField.overridden,
      durationMinutes: durationMinutesField.value,
      passwordOverridden: passwordField.overridden,
      password: passwordField.value,
      integrationsPrairietestOverridden,
      hideQuestions: hideQuestionsField.value,
      showQuestionsAgainDateOverridden: showQuestionsAgainDateField.overridden,
      showQuestionsAgainDate: showQuestionsAgainDateField.value,
      hideQuestionsAgainDateOverridden: hideQuestionsAgainDateField.overridden,
      hideQuestionsAgainDate: hideQuestionsAgainDateField.value,
      hideScore: hideScoreField.value,
      showScoreAgainDateOverridden: showScoreAgainDateField.overridden,
      showScoreAgainDate: showScoreAgainDateField.value,
      studentLabelIds,
      earlyDeadlines: earlyDeadlinesField.value ?? [],
      lateDeadlines: lateDeadlinesField.value ?? [],
      prairietestExams: validExams.map((e) => ({
        uuid: e.examUuid,
        readOnly: e.readOnly ?? false,
      })),
    });
  }

  const ruleRows = preparedRules.map((r) =>
    JSON.stringify({
      number: r.number,
      enabled: r.enabled,
      block_access: r.blockAccess,
      list_before_release: r.listBeforeRelease,
      target_type: r.targetType,
      date_control_overridden: r.dateControlOverridden,
      date_control_release_date_overridden: r.releaseDateOverridden,
      date_control_release_date: r.releaseDate,
      date_control_due_date_overridden: r.dueDateOverridden,
      date_control_due_date: r.dueDate,
      date_control_early_deadlines_overridden: r.earlyDeadlinesOverridden,
      date_control_late_deadlines_overridden: r.lateDeadlinesOverridden,
      date_control_after_last_deadline_allow_submissions: r.afterLastDeadlineAllowSubmissions,
      date_control_after_last_deadline_credit_overridden: r.afterLastDeadlineCreditOverridden,
      date_control_after_last_deadline_credit: r.afterLastDeadlineCredit,
      date_control_duration_minutes_overridden: r.durationMinutesOverridden,
      date_control_duration_minutes: r.durationMinutes,
      date_control_password_overridden: r.passwordOverridden,
      date_control_password: r.password,
      integrations_prairietest_overridden: r.integrationsPrairietestOverridden,
      after_complete_hide_questions: r.hideQuestions,
      after_complete_show_questions_again_date_overridden: r.showQuestionsAgainDateOverridden,
      after_complete_show_questions_again_date: r.showQuestionsAgainDate,
      after_complete_hide_questions_again_date_overridden: r.hideQuestionsAgainDateOverridden,
      after_complete_hide_questions_again_date: r.hideQuestionsAgainDate,
      after_complete_hide_score: r.hideScore,
      after_complete_show_score_again_date_overridden: r.showScoreAgainDateOverridden,
      after_complete_show_score_again_date: r.showScoreAgainDate,
    }),
  );

  // Prepare child data arrays with [rule_number, ...data] format
  // The sproc will join on rule number to get the access_control_id
  const allStudentLabels: string[] = [];
  for (const rule of preparedRules) {
    for (const groupId of rule.studentLabelIds) {
      allStudentLabels.push(JSON.stringify([rule.number, groupId]));
    }
  }

  const allEarlyDeadlines: string[] = [];
  for (const rule of preparedRules) {
    for (const deadline of rule.earlyDeadlines) {
      allEarlyDeadlines.push(JSON.stringify([rule.number, deadline.date, deadline.credit]));
    }
  }

  const allLateDeadlines: string[] = [];
  for (const rule of preparedRules) {
    for (const deadline of rule.lateDeadlines) {
      allLateDeadlines.push(JSON.stringify([rule.number, deadline.date, deadline.credit]));
    }
  }

  const allPrairietestExams: string[] = [];
  for (const rule of preparedRules) {
    for (const exam of rule.prairietestExams) {
      allPrairietestExams.push(JSON.stringify([rule.number, exam.uuid, exam.readOnly]));
    }
  }

  await sqldb.callRows(
    'sync_access_control',
    [
      courseInstanceId,
      assessmentId,
      ruleRows,
      allStudentLabels,
      allEarlyDeadlines,
      allLateDeadlines,
      allPrairietestExams,
    ],
    z.unknown(),
  );
}
