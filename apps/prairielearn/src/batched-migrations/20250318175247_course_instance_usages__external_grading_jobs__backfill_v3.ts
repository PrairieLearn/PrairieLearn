import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

const START_DATE = '2025-02-15T00:00:00Z';
const END_DATE = '2025-03-21T00:00:00Z';

export default makeBatchedMigration({
  async getParameters() {
    // First delete old usage data
    await execute(sql.delete_old_usages, { START_DATE, END_DATE });

    // Only backfill from grading jobs within the date range
    const { min, max } = await queryRow(
      sql.select_bounds,
      { START_DATE, END_DATE },
      z.object({
        min: z.bigint({ coerce: true }).nullable(),
        max: z.bigint({ coerce: true }).nullable(),
      }),
    );
    return { min, max, batchSize: 100_000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(sql.update_course_instance_usages_for_external_gradings, {
      start,
      end,
      START_DATE,
      END_DATE,
    });
  },
});
