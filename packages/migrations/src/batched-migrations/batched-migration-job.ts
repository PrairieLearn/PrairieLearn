import { z } from 'zod';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

export const BatchedMigrationJobStatusSchema = z.enum(['pending', 'failed', 'succeeded']);
export type BatchedMigrationJobStatus = z.infer<typeof BatchedMigrationJobStatusSchema>;

export const BatchedMigrationJobRowSchema = z.object({
  id: z.string(),
  batched_migration_id: z.string(),
  min_value: z.bigint({ coerce: true }),
  max_value: z.bigint({ coerce: true }),
  status: BatchedMigrationJobStatusSchema,
  attempts: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  started_at: z.date().nullable(),
  finished_at: z.date().nullable(),
  data: z.unknown(),
});
export type BatchedMigrationJobRow = z.infer<typeof BatchedMigrationJobRowSchema>;

export async function selectRecentJobsWithStatus(
  batchedMigrationId: string,
  status: BatchedMigrationJobStatus,
  limit: number,
): Promise<BatchedMigrationJobRow[]> {
  return await queryRows(
    sql.select_recent_jobs_with_status,
    { batched_migration_id: batchedMigrationId, status, limit },
    BatchedMigrationJobRowSchema,
  );
}
