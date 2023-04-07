import path from 'path';

export { init } from './migrations';
export { BatchedMigration, initBatchedMigrations } from './batched-migrations';

export const SCHEMA_MIGRATIONS_PATH = path.resolve(__dirname, '..', 'schema-migrations');
