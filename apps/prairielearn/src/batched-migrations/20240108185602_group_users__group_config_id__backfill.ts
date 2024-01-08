import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryOneRowAsync } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(group_id) as max from group_users;', {});
    return {
      min: 1n,
      max: result.rows[0].max,
      batchSize: 1000,
    };
  },
  async execute(min: bigint, max: bigint): Promise<void> {
    await queryAsync(sql.update_group_users_group_config_id, { min, max });
  },
});
