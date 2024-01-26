import * as pg from 'pg';
import * as path from 'path';

import * as sqldb from '@prairielearn/postgres';
import {
  init as initMigrations,
  initBatchedMigrations,
  SCHEMA_MIGRATIONS_PATH,
  stopBatchedMigrations,
} from '@prairielearn/migrations';
import * as sprocs from '../sprocs';
import * as namedLocks from '@prairielearn/named-locks';
import { Context } from 'mocha';

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
    directories: [path.resolve(__dirname, '..', 'batched-migrations')],
  });

  if (runMigrations) {
    await initMigrations(
      [path.resolve(__dirname, '..', 'migrations'), SCHEMA_MIGRATIONS_PATH],
      'prairielearn',
    );
  }

  await sqldb.setRandomSearchSchemaAsync('test');
  await sprocs.init();

  await stopBatchedMigrations();
  await namedLocks.close();
  await sqldb.closeAsync();
}

async function createFromTemplate(
  dbName: string,
  dbTemplateName: string,
  dropFirst: boolean,
): Promise<void> {
  await postgresTestUtils.createDatabase({
    dropExistingDatabase: dropFirst,
    database: dbName,
    templateDatabase: dbTemplateName,
    configurePool: true,
    prepare: () => runMigrationsAndSprocs(dbName, false),
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
  await createFromTemplate(dbName, POSTGRES_DATABASE_TEMPLATE, true);

  // Ideally this would happen only over in `helperServer`, but we need to use
  // the same database details, so this is a convenient place to do it.
  await namedLocks.init(postgresTestUtils.getPoolConfig(), (err) => {
    throw err;
  });
}

export async function before(this: Context): Promise<void> {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  this.timeout?.(20000);
  await setupDatabases();
}

/**
 * This version will only (re)create the database with migrations; it will
 * then close the connection in sqldb. This is necessary for database
 * schema verification, where databaseDiff will set up a connection to the
 * desired database.
 */
export async function beforeOnlyCreate(this: Context): Promise<void> {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  this.timeout?.(20000);
  await setupDatabases();
  await closeSql();
}

export async function after(this: Context): Promise<void> {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  this.timeout?.(20000);
  await closeSql();
  await postgresTestUtils.dropDatabase();
}

export async function createTemplate(): Promise<void> {
  await postgresTestUtils.createDatabase({
    dropExistingDatabase: true,
    database: POSTGRES_DATABASE_TEMPLATE,
    configurePool: false,
    prepare: () => runMigrationsAndSprocs(POSTGRES_DATABASE_TEMPLATE, true),
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
