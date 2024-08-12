import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryOneRowAsync } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from questions;', {});
    return {
      min: 1n,
      max: result.rows[0].max,
      batchSize: 1000,
    };
  },
  async execute(min: bigint, max: bigint): Promise<void> {
    await queryAsync(sql.update_question_manual_perc, { min, max });
  },
});
