import path from 'path';

export { init } from './migrations';

export {
  BatchedMigration,
  BatchedMigrationRow,
  BatchedMigrationStatus,
  BatchedMigrationJobRow,
  BatchedMigrationJobStatus,
  initBatchedMigrations,
  startBatchedMigrations,
  stopBatchedMigrations,
  enqueueBatchedMigration,
  finalizeBatchedMigration,
  selectAllBatchedMigrations,
  selectBatchedMigration,
  selectBatchedMigrationForTimestamp,
  selectRecentJobsWithStatus,
} from './batched-migrations';

export const SCHEMA_MIGRATIONS_PATH = path.resolve(__dirname, '..', 'schema-migrations');
