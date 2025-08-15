import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryRow(sql.select_bounds, z.bigint());
    return {
      min: 1n,
      max,
      batchSize: 1000,
    };
  },

  async execute(min: bigint, max: bigint) {
    await queryAsync(sql.update_course_instances_join_id, {
      min,
      max,
    });
  },
});
