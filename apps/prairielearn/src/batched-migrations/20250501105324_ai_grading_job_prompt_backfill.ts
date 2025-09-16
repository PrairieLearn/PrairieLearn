import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryRow(sql.select_bounds, z.bigint({ coerce: true }).nullable());
    return { min: 1n, max, batchSize: 1000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    // In earlier version of AI grading, the ai_grading_jobs.prompt column is stored
    // as an array of strings rather than an array of json objects.
    // This function finds all entries of ai_grading_jobs.prompt that are arrays of
    // strings and parse the strings into json objects.
    await execute(sql.update_ai_grading_job_prompt_type, {
      start,
      end,
    });
  },
});
