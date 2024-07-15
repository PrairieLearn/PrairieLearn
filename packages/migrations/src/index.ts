import path from 'path';

export { init } from './migrations/index.js';

export {
  type BatchedMigrationRow,
  type BatchedMigrationStatus,
  type BatchedMigrationJobRow,
  type BatchedMigrationJobStatus,
  makeBatchedMigration,
  initBatchedMigrations,
  startBatchedMigrations,
  stopBatchedMigrations,
  enqueueBatchedMigration,
  finalizeBatchedMigration,
  selectAllBatchedMigrations,
  selectBatchedMigration,
  selectBatchedMigrationForTimestamp,
  selectRecentJobsWithStatus,
  retryFailedBatchedMigrationJobs,
} from './batched-migrations/index.js';

export const SCHEMA_MIGRATIONS_PATH = path.resolve(import.meta.dirname, '..', 'schema-migrations');
