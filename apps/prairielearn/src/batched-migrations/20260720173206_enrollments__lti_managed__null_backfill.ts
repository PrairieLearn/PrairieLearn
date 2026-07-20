import { makeBatchedMigration, selectTableIdBounds } from '@prairielearn/migrations';
import { execute, loadSqlEquiv } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const bounds = await selectTableIdBounds('enrollments');
    return { ...bounds, batchSize: 1000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(sql.update_enrollments_lti_managed, { start, end });
  },
});
