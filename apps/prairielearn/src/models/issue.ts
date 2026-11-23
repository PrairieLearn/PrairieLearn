import { z } from 'zod';

import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = loadSqlEquiv(import.meta.url);

/** An issue without its course and system data, which can be large. */
const IssueSummarySchema = z.object({
  id: IdSchema,
  open: z.boolean().nullable(),
  student_message: z.string().nullable(),
  question_qid: z.string().nullable(),
});
type IssueSummary = z.infer<typeof IssueSummarySchema>;

/** The course's own issues among `issue_ids`, oldest first. Issues caused by the system are left out. */
export async function selectIssueSummariesByIds({
  course_id,
  issue_ids,
}: {
  course_id: string;
  issue_ids: string[];
}): Promise<IssueSummary[]> {
  return await queryRows(
    sql.select_issue_summaries_by_ids,
    { course_id, issue_ids },
    IssueSummarySchema,
  );
}

/**
 * Opens or closes the course's own issues among `issue_ids`. `matched` counts those that exist in
 * the course; `updated` counts those whose state changed, each of which is audit logged.
 */
export async function updateIssuesOpen({
  course_id,
  issue_ids,
  open,
  authn_user_id,
}: {
  course_id: string;
  issue_ids: string[];
  open: boolean;
  authn_user_id: string;
}): Promise<{ matched: number; updated: number }> {
  return await queryRow(
    sql.update_issues_open,
    { course_id, issue_ids, open, authn_user_id },
    z.object({ matched: z.number(), updated: z.number() }),
  );
}
