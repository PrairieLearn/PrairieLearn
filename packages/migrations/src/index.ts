import path from 'path';

export { init } from './migrations';

export { BatchedMigration, BatchedMigrationExecutor } from './batched-migration';

export const SCHEMA_MIGRATIONS_PATH = path.resolve(__dirname, '..', 'schema-migrations');
