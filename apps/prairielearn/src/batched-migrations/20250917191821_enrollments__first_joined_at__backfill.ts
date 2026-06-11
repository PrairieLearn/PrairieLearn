import z from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryScalar(sql.select_bounds, z.coerce.bigint().nullable());
    return {
      min: 1n,
      max,
      batchSize: 1000,
    };
  },

  async execute(start: bigint, end: bigint) {
    await execute(sql.update_enrollments_first_joined_at, {
      start,
      end,
    });
  },
});
