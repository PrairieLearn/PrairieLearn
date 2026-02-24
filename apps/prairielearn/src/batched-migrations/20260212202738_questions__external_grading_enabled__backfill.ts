import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryRow(sql.select_bounds, z.bigint({ coerce: true }).nullable());
    return { min: 1n, max: result, batchSize: 50000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(sql.update_questions_external_grading_enabled, { start, end });
  },
});
