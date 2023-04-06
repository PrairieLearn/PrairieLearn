import path from 'path';

export { init } from './migrations';

export { BatchedMigration } from './batched-migrations/batched-migration';
export { BatchedMigrationsRunner } from './batched-migrations/batched-migrations-runner';

export const SCHEMA_MIGRATIONS_PATH = path.resolve(__dirname, '..', 'schema-migrations');
