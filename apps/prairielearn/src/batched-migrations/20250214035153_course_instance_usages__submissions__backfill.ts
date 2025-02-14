import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

import { updateCourseInstanceUsagesForSubmission } from '../models/course-instance-usages.js';

const sql = loadSqlEquiv(import.meta.url);

const CUTOFF_DATE = '2025-02-15T00:00:00Z';

export default makeBatchedMigration({
  async getParameters() {
    // First delete usage data older than a hard-coded date
    await queryAsync(sql.delete_old_usages, { CUTOFF_DATE });

    // Only backfill from submissions that are older than the cutoff date
    const { min, max } = await queryRow(
      sql.select_bounds,
      { CUTOFF_DATE },
      z.object({
        min: z.bigint({ coerce: true }).nullable(),
        max: z.bigint({ coerce: true }).nullable(),
      }),
    );
    return { min, max, batchSize: 1000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    for (let i = start; i <= end; i++) {
      const user_id = await queryRow(
        sql.select_user_id_for_submission_id,
        { submission_id: i },
        z.string(),
      );
      await updateCourseInstanceUsagesForSubmission({
        submission_id: i.toString(),
        user_id,
      });
    }
  },
});
