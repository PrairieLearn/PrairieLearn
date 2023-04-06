import {
  loadSqlEquiv,
  queryAsync,
  queryValidatedOneRow,
  queryValidatedRows,
} from '@prairielearn/postgres';

import { BatchedMigrationRow, BatchedMigrationRowSchema, BatchedMigrationStatus } from './schemas';

const sql = loadSqlEquiv(__filename);

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
  'project' | 'name' | 'timestamp' | 'batch_size' | 'min_value' | 'max_value'
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

export async function allBatchedMigrations(project: string) {
  return queryValidatedRows(
    sql.select_all_batched_migrations,
    { project },
    BatchedMigrationRowSchema
  );
}

export async function updateBatchedMigrationStatus(id: string, status: BatchedMigrationStatus) {
  await queryAsync(sql.update_batched_migration_status, { id, status });
}
