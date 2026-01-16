import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryRow(sql.select_bounds, z.bigint({ coerce: true }).nullable());
    return { min: 1n, max: result, batchSize: 1000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    // Typically, we'd treat audit events as immutable, but in this case we're
    // redefining the meaning of one of the enrollment statuses, so we need to
    // update existing audit events to correctly reflect what happened in the past.
    await execute(sql.update_audit_events_removed_to_left, { start, end });
  },
});
