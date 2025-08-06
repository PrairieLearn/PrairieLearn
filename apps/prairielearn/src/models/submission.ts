import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { IdSchema } from '../lib/db-types.js';

import { lockVariant } from './variant.js';

const sql = loadSqlEquiv(import.meta.url);

export async function lockSubmission({ submission_id }: { submission_id: string }) {
  const variant_id = await queryRow(sql.select_submission_variant_id, { submission_id }, IdSchema);
  await lockVariant({ variant_id });
}
