import { callRow, execute, loadSqlEquiv } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = loadSqlEquiv(import.meta.url);

export interface EnrollmentAccessControlRuleData {
  id?: string;
  enabled: boolean;
  blockAccess: boolean;
  listBeforeRelease: boolean;
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
  prairietestControlOverridden: boolean;
  hideQuestions: boolean | null;
  showQuestionsAgainDateOverridden: boolean;
  showQuestionsAgainDate: string | null;
  hideQuestionsAgainDateOverridden: boolean;
  hideQuestionsAgainDate: string | null;
  hideScore: boolean | null;
  showScoreAgainDateOverridden: boolean;
  showScoreAgainDate: string | null;
  earlyDeadlines: { date: string; credit: number }[];
  lateDeadlines: { date: string; credit: number }[];
}

/**
 * Creates or updates an enrollment-based access control rule (targeting individual students).
 * These rules are stored in the database with number >= 100 and target_type = 'enrollment'.
 *
 * @param courseInstanceId The course instance ID
 * @param assessmentId The assessment ID
 * @param ruleData The rule configuration data
 * @param enrollmentIds Array of enrollment IDs to target
 * @returns The access control rule ID
 */
export async function syncEnrollmentAccessControl(
  courseInstanceId: string,
  assessmentId: string,
  ruleData: EnrollmentAccessControlRuleData,
  enrollmentIds: string[],
): Promise<string> {
  const ruleJson = JSON.stringify({
    id: ruleData.id ?? null,
    enabled: ruleData.enabled,
    block_access: ruleData.blockAccess,
    list_before_release: ruleData.listBeforeRelease,
    date_control_overridden: ruleData.dateControlOverridden,
    date_control_release_date_overridden: ruleData.releaseDateOverridden,
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
    prairietest_control_overridden: ruleData.prairietestControlOverridden,
    after_complete_hide_questions: ruleData.hideQuestions,
    after_complete_show_questions_again_date_overridden: ruleData.showQuestionsAgainDateOverridden,
    after_complete_show_questions_again_date: ruleData.showQuestionsAgainDate,
    after_complete_hide_questions_again_date_overridden: ruleData.hideQuestionsAgainDateOverridden,
    after_complete_hide_questions_again_date: ruleData.hideQuestionsAgainDate,
    after_complete_hide_score: ruleData.hideScore,
    after_complete_show_score_again_date_overridden: ruleData.showScoreAgainDateOverridden,
    after_complete_show_score_again_date: ruleData.showScoreAgainDate,
  });

  const earlyDeadlinesJson = ruleData.earlyDeadlines.map((d) =>
    JSON.stringify({ date: d.date, credit: d.credit }),
  );
  const lateDeadlinesJson = ruleData.lateDeadlines.map((d) =>
    JSON.stringify({ date: d.date, credit: d.credit }),
  );

  return callRow(
    'sync_enrollment_access_control',
    [
      courseInstanceId,
      assessmentId,
      ruleJson,
      `{${enrollmentIds.join(',')}}`,
      earlyDeadlinesJson,
      lateDeadlinesJson,
    ],
    IdSchema,
  );
}

/**
 * Deletes an enrollment-based access control rule.
 *
 * @param accessControlId The access control rule ID to delete
 */
export async function deleteEnrollmentAccessControl(accessControlId: string): Promise<void> {
  await execute(sql.delete_enrollment_rule, { id: accessControlId });
}
