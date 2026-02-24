import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

const END_DATE = '2026-02-15T00:00:00Z';

export default makeBatchedMigration({
  async getParameters() {
    // First delete usage data older than a hard-coded date
    await execute(sql.delete_old_usages, { END_DATE });

    // Only backfill from workspaces that are older than the end date
    const max = await queryRow(
      sql.select_bounds,
      { END_DATE },
      z.bigint({ coerce: true }).nullable(),
    );
    return { min: 1n, max, batchSize: 10_000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(sql.update_course_instance_usages_for_workspaces, { start, end, END_DATE });
  },
});
