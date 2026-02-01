import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Update the open/closed status of an issue.
 */
export async function updateIssueOpenStatus({
  issueId,
  open,
}: {
  issueId: string;
  open: boolean;
}): Promise<string> {
  return await queryRow(
    sql.update_issue_open_status,
    {
      issue_id: issueId,
      open,
    },
    IdSchema,
  );
}
