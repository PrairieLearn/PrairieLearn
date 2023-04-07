import {
  loadSqlEquiv,
  queryAsync,
  queryValidatedOneRow,
  queryValidatedRows,
} from '@prairielearn/postgres';
import { z } from 'zod';

const sql = loadSqlEquiv(__filename);

export const BatchedMigrationStatusSchema = z.enum([
  'pending',
  'paused',
  'running',
  'failed',
  'succeeded',
]);
export type BatchedMigrationStatus = z.infer<typeof BatchedMigrationStatusSchema>;

export const BatchedMigrationRowSchema = z.object({
  id: z.string(),
  project: z.string(),
  filename: z.string(),
  timestamp: z.string(),
  batch_size: z.number(),
  min_value: z.bigint({ coerce: true }),
  max_value: z.bigint({ coerce: true }),
  status: BatchedMigrationStatusSchema,
  created_at: z.date(),
  updated_at: z.date(),
  started_at: z.date().nullable(),
});
export type BatchedMigrationRow = z.infer<typeof BatchedMigrationRowSchema>;

export interface BatchedMigrationParameters {
  min: bigint;
  max: bigint;
  batchSize: number;
}

/**
 * A batched migration operates on a range of IDs in batches. It's designed
 * for migrations that are too large to run in a single transaction.
 *
 * Migrations should be idempotent, as they may be run multiple times in case
 * of unexpected failure.
 */
export abstract class BatchedMigration {
  public abstract getParameters(): Promise<BatchedMigrationParameters>;
  public abstract execute(start: bigint, end: bigint): Promise<void>;
}

type NewBatchedMigration = Pick<
  BatchedMigrationRow,
  'project' | 'filename' | 'timestamp' | 'batch_size' | 'min_value' | 'max_value'
>;

export async function insertBatchedMigration(
  migration: NewBatchedMigration
): Promise<BatchedMigrationRow> {
  return await queryValidatedOneRow(
    sql.insert_batched_migration,
    migration,
    BatchedMigrationRowSchema
  );
}

export async function selectAllBatchedMigrations(project: string) {
  return queryValidatedRows(
    sql.select_all_batched_migrations,
    { project },
    BatchedMigrationRowSchema
  );
}

export async function updateBatchedMigrationStatus(id: string, status: BatchedMigrationStatus) {
  await queryAsync(sql.update_batched_migration_status, { id, status });
}
