import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryRow(sql.select_bounds, z.bigint({ coerce: true }).nullable());
    return { min: 1n, max: result, batchSize: 1000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await queryAsync(sql.update_variants_modified_at, { start, end });
  },
});
