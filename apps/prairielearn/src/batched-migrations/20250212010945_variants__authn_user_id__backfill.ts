import z from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const results = await queryRow(
      sql.select_bounds,
      z.object({
        min: z.bigint({ coerce: true }).nullable(),
        max: z.bigint({ coerce: true }).nullable(),
      }),
    );
    return {
      min: results.min,
      max: results.max,
      batchSize: 1000,
    };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(sql.backfill_authn_user_id, { start, end });
  },
});
