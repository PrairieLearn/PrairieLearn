import {
  loadSqlEquiv,
  queryValidatedOneRow,
  queryValidatedRows,
  queryValidatedZeroOrOneRow,
} from '@prairielearn/postgres';
import { z } from 'zod';

const sql = loadSqlEquiv(__filename);

export const BatchedMigrationStatusSchema = z.enum([
  'pending',
  'paused',
  'running',
  'finalizing',
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
  min?: bigint | null;
  max: bigint | null;
  batchSize?: number;
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
  'project' | 'filename' | 'timestamp' | 'batch_size' | 'min_value' | 'max_value' | 'status'
>;

/**
 * Inserts a new batched migration. If one already exists for the given
 * project/timestamp pair, returns null, otherwise returns the inserted row.
 */
export async function insertBatchedMigration(
  migration: NewBatchedMigration
): Promise<BatchedMigrationRow | null> {
  return queryValidatedZeroOrOneRow(
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

export async function selectBatchedMigration(
  project: string,
  id: string
): Promise<BatchedMigrationRow> {
  return queryValidatedOneRow(
    sql.select_batched_migration,
    { project, id },
    BatchedMigrationRowSchema
  );
}

export async function selectBatchedMigrationForTimestamp(
  project: string,
  timestamp: string
): Promise<BatchedMigrationRow> {
  return queryValidatedOneRow(
    sql.select_batched_migration_for_timestamp,
    { project, timestamp },
    BatchedMigrationRowSchema
  );
}

export async function updateBatchedMigrationStatus(
  id: string,
  status: BatchedMigrationStatus
): Promise<BatchedMigrationRow> {
  return queryValidatedOneRow(
    sql.update_batched_migration_status,
    { id, status },
    BatchedMigrationRowSchema
  );
}
