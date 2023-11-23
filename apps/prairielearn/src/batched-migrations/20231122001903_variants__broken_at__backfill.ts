import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryOneRowAsync } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from variants;', {});
    return {
      min: 1n,
      max: result.rows[0].max,
      batchSize: 1000,
    };
  },

  async execute(start: bigint, end: bigint): Promise<void> {
    await queryAsync(sql.update_variants_broken_at, { start, end });
  },
});
