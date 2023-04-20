import path from 'path';

export { init } from './migrations';

export {
  BatchedMigrationRow,
  BatchedMigrationStatus,
  BatchedMigrationJobRow,
  BatchedMigrationJobStatus,
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
} from './batched-migrations';

export const SCHEMA_MIGRATIONS_PATH = path.resolve(__dirname, '..', 'schema-migrations');
