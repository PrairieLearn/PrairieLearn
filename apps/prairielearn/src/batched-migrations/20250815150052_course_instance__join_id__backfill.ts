import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryRow(sql.select_bounds, z.coerce.bigint().nullable());
    return {
      min: 1n,
      max: max ?? 1n,
      batchSize: 1000,
    };
  },

  async execute(start: bigint, end: bigint) {
    await queryAsync(sql.update_course_instances_join_id, {
      start,
      end,
    });
  },
});
