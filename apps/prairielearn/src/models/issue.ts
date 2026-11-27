import { z } from 'zod';

import { loadSqlEquiv, queryOptionalScalar, queryRows, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = loadSqlEquiv(import.meta.url);

/** What identifies an issue to staff, without its course and system data. */
const IssueSummarySchema = z.object({
  id: IdSchema,
  open: z.boolean().nullable(),
  question_qid: z.string().nullable(),
});
export type IssueSummary = z.infer<typeof IssueSummarySchema>;

/** The course's own issues among `issue_ids`, in ID order. Issues caused by the system are left out. */
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
 * Opens or closes one of the course's own issues, and audit logs the change. Returns false when
 * the course has no such issue.
 */
export async function updateIssueOpen({
  issue_id,
  open,
  course_id,
  authn_user_id,
}: {
  issue_id: string;
  open: boolean;
  course_id: string;
  authn_user_id: string;
}): Promise<boolean> {
  const updated_issue_id = await queryOptionalScalar(
    sql.update_issue_open,
    { issue_id, new_open: open, course_id, authn_user_id },
    IdSchema,
  );
  return updated_issue_id !== null;
}

/**
 * Closes the course's own open issues among `issue_ids`, and audit logs each. Returns how many
 * it closed.
 */
export async function closeIssues({
  issue_ids,
  course_id,
  authn_user_id,
}: {
  issue_ids: string[];
  course_id: string;
  authn_user_id: string;
}): Promise<number> {
  return await queryScalar(sql.close_issues, { issue_ids, course_id, authn_user_id }, z.number());
}
