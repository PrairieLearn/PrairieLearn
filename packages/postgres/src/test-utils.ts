import pg from 'pg';

import * as defaultPool from './default-pool';

const POSTGRES_USER = 'postgres';
const POSTGRES_HOST = 'localhost';
const POSTGRES_DATABASE = 'postgres';

export interface PostgresTestUtilsOptions {
  user?: string;
  host?: string;
  defaultDatabase?: string;
  database: string;
  prepareAfterReset?: (client: pg.Client) => Promise<void>;
}

interface CreateDatabaseOptions {
  dropExistingDatabase?: boolean;
  configurePool?: boolean;
  templateDatabase?: string;
  prepare?: (client: pg.Client) => Promise<void>;
}

interface DropDatabaseOptions {
  database?: string;
  force?: boolean;
  closePool?: boolean;
}

async function createDatabase(
  options: PostgresTestUtilsOptions,
  createOptions: CreateDatabaseOptions = {}
): Promise<void> {
  const dropExistingDatabase = createOptions.dropExistingDatabase ?? true;
  const configurePool = createOptions.configurePool ?? true;

  const client = new pg.Client({
    ...getPoolConfig(options),
    database: options.defaultDatabase ?? POSTGRES_DATABASE,
  });
  await client.connect();

  const escapedDatabase = client.escapeIdentifier(
    getDatabaseNameForCurrentMochaWorker(options.database)
  );
  if (dropExistingDatabase ?? true) {
    await client.query(`DROP DATABASE IF EXISTS ${escapedDatabase}`);
  }

  if (createOptions.templateDatabase) {
    const escapedTemplateDatabase = client.escapeIdentifier(createOptions.templateDatabase);
    await client.query(`CREATE DATABASE ${escapedDatabase} TEMPLATE ${escapedTemplateDatabase}`);
  } else {
    await client.query(`CREATE DATABASE ${escapedDatabase}`);
  }

  await client.end();

  await createOptions.prepare?.(client);

  if (configurePool) {
    await defaultPool.initAsync(
      {
        user: options.user ?? POSTGRES_USER,
        host: options.host ?? POSTGRES_HOST,
        database: getDatabaseNameForCurrentMochaWorker(options.database),
        // TODO: make these configurable?
        max: 10,
        idleTimeoutMillis: 30000,
      },
      (err) => {
        throw err;
      }
    );
  }
}

async function resetDatabase(options: PostgresTestUtilsOptions): Promise<void> {
  const client = new pg.Client(getPoolConfig(options));
  await client.connect();
  await client.query(`
    DO
    $func$
    BEGIN
      EXECUTE (
        SELECT 'TRUNCATE TABLE ' || string_agg(oid::regclass::text, ', ') || ' RESTART IDENTITY CASCADE'
          FROM pg_class
          WHERE relkind = 'r'
          AND relnamespace = 'public'::regnamespace
      );
    END
    $func$;
  `);
  await options.prepareAfterReset?.(client);
  await client.end();
}

async function dropDatabase(
  options: PostgresTestUtilsOptions,
  dropOptions: DropDatabaseOptions = {}
): Promise<void> {
  if (dropOptions.closePool ?? true) {
    await defaultPool.closeAsync();
  }

  const database = dropOptions.database ?? getDatabaseNameForCurrentMochaWorker(options.database);
  if ('PL_KEEP_TEST_DB' in process.env && !(dropOptions.force ?? false)) {
    console.log(`PL_KEEP_TEST_DB enviroment variable set, not dropping database ${database}`);
    return;
  }

  const client = new pg.Client({
    ...getPoolConfig(options),
    database: options.defaultDatabase ?? POSTGRES_DATABASE,
  });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(database)}`);
  await client.end();
}

function getDatabaseNameForCurrentMochaWorker(namespace: string): string {
  const workerId = process.env.MOCHA_WORKER_ID ?? '1';
  return `${namespace}_${workerId}`;
}

function getPoolConfig(options: PostgresTestUtilsOptions): pg.PoolConfig {
  return {
    user: options.user ?? POSTGRES_USER,
    host: options.host ?? POSTGRES_HOST,
    database: getDatabaseNameForCurrentMochaWorker(options.database),
  };
}

export interface PostgresTestUtils {
  createDatabase: (options?: CreateDatabaseOptions) => Promise<void>;
  resetDatabase: () => Promise<void>;
  dropDatabase: (options?: DropDatabaseOptions) => Promise<void>;
  getDatabaseNameForCurrentMochaWorker: () => string;
  getPoolConfig: () => pg.PoolConfig;
}

export function makePostgresTestUtils(options: PostgresTestUtilsOptions): PostgresTestUtils {
  return {
    createDatabase: (createOptions?: CreateDatabaseOptions) =>
      createDatabase(options, createOptions),
    resetDatabase: () => resetDatabase(options),
    dropDatabase: (dropOptions?: DropDatabaseOptions) => dropDatabase(options, dropOptions),
    getDatabaseNameForCurrentMochaWorker: () =>
      getDatabaseNameForCurrentMochaWorker(options.database),
    getPoolConfig: () => getPoolConfig(options),
  };
}
