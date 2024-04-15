import {
  loadSqlEquiv,
  queryAsync,
  queryRow,
  queryRows,
  queryOptionalRow,
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
  min?: bigint | string | null;
  max: bigint | string | null;
  batchSize?: number;
}

export interface BatchedMigrationImplementation {
  getParameters(): Promise<BatchedMigrationParameters>;
  execute(start: bigint, end: bigint): Promise<void>;
}

/**
 * Identity function that helps to write correct batched migrations.
 */
export function makeBatchedMigration<T extends BatchedMigrationImplementation>(fns: T): T {
  validateBatchedMigrationImplementation(fns);
  return fns;
}

export function validateBatchedMigrationImplementation(
  fns: BatchedMigrationImplementation,
): asserts fns is BatchedMigrationImplementation {
  if (typeof fns.getParameters !== 'function') {
    throw new Error('getParameters() must be a function');
  }
  if (typeof fns.execute !== 'function') {
    throw new Error('execute() must be a function');
  }
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
  migration: NewBatchedMigration,
): Promise<BatchedMigrationRow | null> {
  return await queryOptionalRow(sql.insert_batched_migration, migration, BatchedMigrationRowSchema);
}

export async function selectAllBatchedMigrations(project: string) {
  return await queryRows(sql.select_all_batched_migrations, { project }, BatchedMigrationRowSchema);
}

export async function selectBatchedMigration(
  project: string,
  id: string,
): Promise<BatchedMigrationRow> {
  return await queryRow(sql.select_batched_migration, { project, id }, BatchedMigrationRowSchema);
}

export async function selectBatchedMigrationForTimestamp(
  project: string,
  timestamp: string,
): Promise<BatchedMigrationRow> {
  return await queryRow(
    sql.select_batched_migration_for_timestamp,
    { project, timestamp },
    BatchedMigrationRowSchema,
  );
}

export async function updateBatchedMigrationStatus(
  id: string,
  status: BatchedMigrationStatus,
): Promise<BatchedMigrationRow> {
  return await queryRow(
    sql.update_batched_migration_status,
    { id, status },
    BatchedMigrationRowSchema,
  );
}

export async function retryFailedBatchedMigrationJobs(project: string, id: string): Promise<void> {
  await queryAsync(sql.retry_failed_jobs, { project, id });
}
