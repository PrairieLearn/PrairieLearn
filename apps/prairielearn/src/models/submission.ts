import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { IdSchema } from '@prairielearn/zod';

import { lockVariant } from './variant.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Locks the variant or assessment question associated with the given submission
 * ID. This is used to ensure that no other process can modify related data
 * while the current process is working with it. It assumes that the caller is
 * already within a transaction.
 */
export async function lockSubmission({ submission_id }: { submission_id: string }) {
  const variant_id = await queryRow(sql.select_submission_variant_id, { submission_id }, IdSchema);
  await lockVariant({ variant_id });
}
