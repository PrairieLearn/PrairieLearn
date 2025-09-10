import z from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryRow(
      'SELECT MAX(id) as max from variants;',
      z.bigint({ coerce: true }).nullable(),
    );
    return {
      min: 1n,
      max,
      batchSize: 1000,
    };
  },

  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(sql.update_variants_broken_at, { start, end });
  },
});
