import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

const END_DATE = '2025-03-21T00:00:00Z';

export default makeBatchedMigration({
  async getParameters() {
    // First delete old usage data
    await execute(sql.delete_old_usages, { END_DATE });

    // Only backfill from workspaces within the date range
    const min = 1n;
    const max = await queryRow(
      sql.select_max_bound,
      { END_DATE },
      z.bigint({ coerce: true }).nullable(),
    );
    return { min, max, batchSize: 10_000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(sql.update_course_instance_usages_for_workspaces, {
      start,
      end,
      END_DATE,
    });
  },
});
