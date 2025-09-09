import * as path from 'path';

import pg from 'pg';

import {
  SCHEMA_MIGRATIONS_PATH,
  extractTimestampFromFilename,
  initBatchedMigrations,
  init as initMigrations,
  stopBatchedMigrations,
} from '@prairielearn/migrations';
import * as namedLocks from '@prairielearn/named-locks';
import * as sqldb from '@prairielearn/postgres';

import * as sprocs from '../sprocs/index.js';

const POSTGRES_USER = 'postgres';
const POSTGRES_HOST = 'localhost';
const POSTGRES_INIT_CONNECTION_STRING = 'postgres://postgres@localhost/postgres';

const POSTGRES_DATABASE = 'pltest';
const POSTGRES_DATABASE_TEMPLATE = 'pltest_template';

const postgresTestUtils = sqldb.makePostgresTestUtils({
  user: POSTGRES_USER,
  host: POSTGRES_HOST,
  defaultDatabase: 'postgres',
  database: POSTGRES_DATABASE,
  prepareAfterReset: async (client) => {
    // This is the sole piece of database state that's actually created in a
    // migration (`153_institutions__create`) - when we TRUNCATE the `institutions`
    // table when resetting the database, we lose the default institution, so we
    // add it back here.
    await client.query(
      "INSERT INTO institutions (id, long_name, short_name) VALUES (1, 'Default', 'Default') ON CONFLICT DO NOTHING;",
    );
  },
});

async function runMigrationsAndSprocs(dbName: string, runMigrations: boolean): Promise<void> {
  const pgConfig = {
    user: POSTGRES_USER,
    database: dbName,
    host: POSTGRES_HOST,
    max: 10,
    idleTimeoutMillis: 30000,
    errorOnUnusedParameters: true,
  };
  function idleErrorHandler(err) {
    throw err;
  }
  await sqldb.initAsync(pgConfig, idleErrorHandler);

  // We have to do this here so that `migrations.init` can successfully
  // acquire a lock.
  await namedLocks.init(pgConfig, idleErrorHandler);

  // Some migrations will call `enqueueBatchedMigration` and `finalizeBatchedMigration`,
  // so we need to make sure the batched migration machinery is initialized.
  initBatchedMigrations({
    project: 'prairielearn',
    directories: [path.resolve(import.meta.dirname, '..', 'batched-migrations')],
  });

  if (runMigrations) {
    await initMigrations({
      directories: [path.resolve(import.meta.dirname, '..', 'migrations'), SCHEMA_MIGRATIONS_PATH],
      project: 'prairielearn',
    });
  }

  await sqldb.setRandomSearchSchemaAsync('test');
  await sprocs.init();

  await stopBatchedMigrations();
  await namedLocks.close();
  await sqldb.closeAsync();
}

async function createFromTemplate({
  dbName,
  dbTemplateName,
  dropFirst,
}: {
  dbName: string;
  dbTemplateName: string;
  dropFirst: boolean;
}): Promise<void> {
  await postgresTestUtils.createDatabase({
    dropExistingDatabase: dropFirst,
    database: dbName,
    templateDatabase: dbTemplateName,
    configurePool: true,
    prepare: () => runMigrationsAndSprocs({ dbName, runMigrations: false, initDatabase: true }),
  });
}

async function closeSql(): Promise<void> {
  await namedLocks.close();
  await sqldb.closeAsync();
}

async function databaseExists(dbName: string): Promise<boolean> {
  const client = new pg.Client(POSTGRES_INIT_CONNECTION_STRING);
  await client.connect();
  const result = await client.query(
    `SELECT exists(SELECT * FROM pg_catalog.pg_database WHERE datname = '${dbName}');`,
  );
  const existsResult = result.rows[0].exists;
  await client.end();
  return existsResult;
}

async function setupDatabases(): Promise<void> {
  const templateExists = await databaseExists(POSTGRES_DATABASE_TEMPLATE);
  const dbName = getDatabaseNameForCurrentWorker();
  if (!templateExists) {
    await createTemplate();
  }

  await createFromTemplate({ dbName, dbTemplateName: POSTGRES_DATABASE_TEMPLATE, dropFirst: true });

  // Ideally this would happen only over in `helperServer`, but we need to use
  // the same database details, so this is a convenient place to do it.
  await namedLocks.init(postgresTestUtils.getPoolConfig(), (err) => {
    throw err;
  });
}

async function runMigrations(
  migrationFilters: Parameters<typeof initMigrations>[0]['migrationFilters'] = {},
): Promise<void> {
  await initMigrations({
    directories: [path.resolve(import.meta.dirname, '..', 'migrations'), SCHEMA_MIGRATIONS_PATH],
    project: 'prairielearn',
    migrationFilters,
  });
}

/**
 * Runs all migrations with a timestamp before the given migration.
 * @param migrationName The name of the migration to run all migrations before.
 */
export async function runMigrationsBefore(migrationName: string): Promise<void> {
  await runMigrations({
    beforeTimestamp: extractTimestampFromFilename(migrationName),
    inclusiveBefore: false,
  });
}

/**
 * Runs all migrations with a timestamp before the given migration, and including the given migration.
 * @param migrationName The name of the migration to run all migrations including.
 */
export async function runMigrationsThrough(migrationName: string): Promise<void> {
  await runMigrations({
    beforeTimestamp: extractTimestampFromFilename(migrationName),
    inclusiveBefore: true,
  });
}

export async function runRemainingMigrations(): Promise<void> {
  await runMigrations();
}

export async function before(): Promise<void> {
  await setupDatabases();
}

/**
 * This version will only (re)create the database with migrations; it will
 * then close the connection in sqldb. This is necessary for database
 * schema verification, where databaseDiff will set up a connection to the
 * desired database.
 */
export async function beforeOnlyCreate(): Promise<void> {
  await setupDatabases();
  await closeSql();
}

export async function after(): Promise<void> {
  await closeSql();
  await postgresTestUtils.dropDatabase();
}

export async function createTemplate(): Promise<void> {
  await postgresTestUtils.createDatabase({
    dropExistingDatabase: true,
    database: POSTGRES_DATABASE_TEMPLATE,
    configurePool: false,
    prepare: () =>
      runMigrationsAndSprocs({
        dbName: POSTGRES_DATABASE_TEMPLATE,
        runMigrations: true,
        initDatabase: true,
      }),
  });
}

export async function dropTemplate(): Promise<void> {
  await closeSql();
  await postgresTestUtils.dropDatabase({
    database: POSTGRES_DATABASE_TEMPLATE,
    // Always drop the template regardless of PL_KEEP_TEST_DB env
    force: true,
  });
}

/**
 * Helper function for testing migrations.
 * @param params
 * @param params.name The name of the migration to test.
 * @param params.beforeMigration A function to run before the migration.
 * @param params.afterMigration A function to run after the migration.
 */
export async function testMigration<T>({
  name,
  beforeMigration,
  afterMigration,
}: {
  name: string;
  beforeMigration?: () => Promise<T> | T;
  afterMigration?: (beforeResult: T) => Promise<void> | void;
}): Promise<void> {
  const dbName = getDatabaseNameForCurrentWorker();

  await postgresTestUtils.createDatabase({
    dropExistingDatabase: true,
    database: dbName,
    configurePool: true,
  });

  // We have to do this here so that `migrations.init` can successfully
  // acquire a lock.
  await namedLocks.init(postgresTestUtils.getPoolConfig(), (err) => {
    throw err;
  });

  // Some migrations will call `enqueueBatchedMigration` and `finalizeBatchedMigration`,
  // so we need to make sure the batched migration machinery is initialized.
  initBatchedMigrations({
    project: 'prairielearn',
    directories: [path.resolve(import.meta.dirname, '..', 'batched-migrations')],
  });

  try {
    await runMigrationsBefore(name);

    // This is done to support tests that may need to use sprocs. This might fail
    // if the migration creates tables that the sprocs depend on. We'll cross that
    // bridge if we come to it.
    await sqldb.setRandomSearchSchemaAsync('test');
    await sprocs.init();

    const result = (await beforeMigration?.()) as T;

    await runMigrationsThrough(name);

    if (afterMigration) {
      await afterMigration(result);
    }

    await runRemainingMigrations();

    await closeSql();
    await postgresTestUtils.dropDatabase();
  } catch (err) {
    await stopBatchedMigrations();
    await namedLocks.close();
    await sqldb.closeAsync();
    throw err;
  }
}

export async function resetDatabase(): Promise<void> {
  await postgresTestUtils.resetDatabase();
}

export function getDatabaseNameForCurrentWorker(): string {
  return postgresTestUtils.getDatabaseNameForCurrentMochaWorker();
}

class RollbackTransactionError extends Error {
  constructor() {
    super('Rollback transaction');
    this.name = 'RollbackTransactionError';
  }
}

/**
 * Runs the provided function in the context of a transaction, then rolls the
 * transaction back after the function completes.
 *
 * Note that this relies on AsyncLocalStorage to propagate the transaction.
 * The current transaction will not be propagated across network calls, so
 * use this carefully.
 */
export async function runInTransactionAndRollback(fn: () => Promise<void>): Promise<void> {
  await sqldb
    .runInTransactionAsync(async () => {
      await fn();
      throw new RollbackTransactionError();
    })
    .catch((err) => {
      if (err instanceof RollbackTransactionError) {
        return;
      }
      throw err;
    });
}
