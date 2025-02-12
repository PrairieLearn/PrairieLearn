import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const results = await queryAsync(
      'SELECT MIN(id) AS min, MAX(id) AS max FROM variants WHERE authn_user_id IS NULL;',
      {},
    );
    return {
      min: results.rows[0].min,
      max: results.rows[0].max,
      batchSize: 1000,
    };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await queryAsync(sql.backfill_authn_user_id, { start, end });
  },
});
