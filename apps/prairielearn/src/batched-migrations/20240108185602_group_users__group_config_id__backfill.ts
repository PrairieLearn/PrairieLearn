import z from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryRow(
      'SELECT MAX(group_id) as max from group_users;',
      z.bigint({ coerce: true }).nullable(),
    );
    return {
      min: 1n,
      max,
      batchSize: 1000,
    };
  },
  async execute(min: bigint, max: bigint): Promise<void> {
    await execute(sql.update_group_users_group_config_id, { min, max });
  },
});
