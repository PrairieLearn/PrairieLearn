import { z } from 'zod';

import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = loadSqlEquiv(import.meta.url);

/** Called inside the transaction that inserts the submission. */
export async function insertSharedQuestionUsagesForSubmission(submission_id: string) {
  await execute(sql.insert_shared_question_usages_for_submission, { submission_id });
}

/**
 * Historical reach from recorded usage, including deleted destination records.
 * Complete lifetime reports must wait until historical backfill is finalized.
 */
export async function selectSharedQuestionUsageCounts(question_ids: string[]) {
  return await queryRows(
    sql.select_shared_question_usage_counts,
    { question_ids },
    z.object({
      question_id: IdSchema,
      student_count: z.number().int().nonnegative(),
    }),
  );
}
