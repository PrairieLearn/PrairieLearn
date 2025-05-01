import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    // Should backfill all existing rows of ai_grading_jobs
    const { min, max } = await queryRow(
      sql.select_bounds,
      z.object({
        min: z.bigint({ coerce: true }).nullable(),
        max: z.bigint({ coerce: true }).nullable(),
      }),
    );
    return { min, max, batchSize: 10_000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await queryAsync(sql.update_ai_grading_job_prompt_type, {
      start,
      end,
    });
  },
});
