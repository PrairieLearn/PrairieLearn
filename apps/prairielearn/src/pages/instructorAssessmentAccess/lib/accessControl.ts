import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import {
  AccessControlEarlyDeadlineSchema,
  AccessControlLateDeadlineSchema,
  AccessControlPrairietestExamSchema,
  AccessControlSchema,
} from '../../../lib/db-types.js';
import type { AccessControlJson } from '../../../schemas/accessControl.js';

const sql = loadSqlEquiv(import.meta.url);

/** Schema for the query result that includes aggregated child table data */
const AccessControlWithChildrenSchema = AccessControlSchema.extend({
  early_deadlines: z.array(AccessControlEarlyDeadlineSchema),
  late_deadlines: z.array(AccessControlLateDeadlineSchema),
  prairietest_exams: z.array(AccessControlPrairietestExamSchema),
  targets: z.array(z.string()),
});

type AccessControlWithChildren = z.infer<typeof AccessControlWithChildrenSchema>;

/** Format a Date object to ISO date string (YYYY-MM-DDTHH:mm) */
function formatDateToIso(date: Date | null): string | undefined {
  if (!date) return undefined;
  return date.toISOString().slice(0, 16);
}

/** Transform a database row to the AccessControlJson format */
function transformToJson(row: AccessControlWithChildren): AccessControlJson {
  return {
    enabled: row.enabled ?? undefined,
    blockAccess: row.block_access ?? undefined,
    listBeforeRelease: row.list_before_release ?? undefined,
    targets: row.targets.length > 0 ? row.targets : undefined,

    dateControl: {
      enabled: row.date_control_overridden === null ? undefined : !row.date_control_overridden,
      releaseDate: formatDateToIso(row.date_control_release_date),
      dueDate: formatDateToIso(row.date_control_due_date),
      earlyDeadlines:
        row.early_deadlines.length > 0
          ? row.early_deadlines.map((d) => ({
              date: d.date.toISOString().slice(0, 16),
              credit: d.credit,
            }))
          : undefined,
      lateDeadlines:
        row.late_deadlines.length > 0
          ? row.late_deadlines.map((d) => ({
              date: d.date.toISOString().slice(0, 16),
              credit: d.credit,
            }))
          : undefined,
      afterLastDeadline:
        row.date_control_after_last_deadline_allow_submissions !== null ||
        row.date_control_after_last_deadline_credit !== null
          ? {
              allowSubmissions: row.date_control_after_last_deadline_allow_submissions ?? undefined,
              credit: row.date_control_after_last_deadline_credit ?? undefined,
            }
          : undefined,
      durationMinutes: row.date_control_duration_minutes ?? undefined,
      password: row.date_control_password ?? undefined,
    },

    prairieTestControl: {
      enabled:
        row.prairietest_control_overridden === null
          ? undefined
          : !row.prairietest_control_overridden,
      exams:
        row.prairietest_exams.length > 0
          ? row.prairietest_exams.map((e) => ({
              examUuid: e.uuid,
              readOnly: e.read_only ?? undefined,
            }))
          : undefined,
    },

    afterComplete: {
      hideQuestions: row.after_complete_hide_questions ?? undefined,
      showQuestionsAgainDate: row.after_complete_hide_questions_show_again_date ? true : undefined,
      hideQuestionsAgainDate: row.after_complete_hide_questions_hide_again_date ? true : undefined,
      hideScore: row.after_complete_hide_score ?? undefined,
      showScoreAgainDate: row.after_complete_hide_score_show_again_date ? true : undefined,
    },
  };
}

/**
 * Fetch access control rules for an assessment and transform them to JSON format.
 * @param assessmentId - The ID of the assessment to fetch access control rules for
 * @returns Array of AccessControlJson objects ordered by their order field
 */
export async function getAccessControlForAssessment(
  assessmentId: string,
): Promise<AccessControlJson[]> {
  const rows = await queryRows(
    sql.select_access_control_for_assessment,
    { assessment_id: assessmentId },
    AccessControlWithChildrenSchema,
  );

  return rows.map(transformToJson);
}
