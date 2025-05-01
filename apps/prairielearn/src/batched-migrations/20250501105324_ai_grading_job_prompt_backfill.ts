import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    // Only backfill from workspaces within the date range
    const min = 1n;
    const max = await queryRow(sql.select_max_bound, z.bigint({ coerce: true }).nullable());
    return { min, max, batchSize: 10_000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    // something here
  },
});
