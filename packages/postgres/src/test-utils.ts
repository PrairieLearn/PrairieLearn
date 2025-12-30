import pg from 'pg';

import * as defaultPool from './default-pool.js';

const POSTGRES_USER = 'postgres';
const POSTGRES_HOST = 'localhost';
const POSTGRES_DATABASE = 'postgres';

export interface PostgresTestUtilsOptions {
  database: string;
  user?: string;
  host?: string;
  poolConfig?: Pick<pg.PoolConfig, 'max' | 'idleTimeoutMillis'>;
  defaultDatabase?: string;
  prepareAfterReset?: (client: pg.Client) => Promise<void>;
}

type PostgresTestPoolConfig = Required<Pick<pg.PoolConfig, 'user' | 'host' | 'database'>>;

interface CreateDatabaseOptions {
  dropExistingDatabase?: boolean;
  database?: string;
  templateDatabase?: string;
  configurePool?: boolean;
  prepare?: (client: pg.Client) => Promise<void>;
}

interface DropDatabaseOptions {
  database?: string;
  force?: boolean;
  closePool?: boolean;
}

async function createDatabase(
  options: PostgresTestUtilsOptions,
  {
    dropExistingDatabase = true,
    configurePool = true,
    database,
    templateDatabase,
    prepare,
  }: CreateDatabaseOptions = {},
): Promise<PostgresTestPoolConfig> {
  const client = new pg.Client({
    ...getPoolConfig(options),
    database: options.defaultDatabase ?? POSTGRES_DATABASE,
  });
  await client.connect();

  const escapedDatabase = client.escapeIdentifier(
    database ?? getDatabaseNameForCurrentTestWorker(options.database),
  );
  if (dropExistingDatabase ?? true) {
    await client.query(`DROP DATABASE IF EXISTS ${escapedDatabase}`);
  }

  if (templateDatabase) {
    const escapedTemplateDatabase = client.escapeIdentifier(templateDatabase);
    await client.query(`CREATE DATABASE ${escapedDatabase} TEMPLATE ${escapedTemplateDatabase}`);
  } else {
    await client.query(`CREATE DATABASE ${escapedDatabase}`);
  }

  await client.end();

  await prepare?.(client);

  const poolConfig = getPoolConfig(options);

  if (configurePool) {
    await defaultPool.initAsync(
      {
        ...poolConfig,
        // Offer sensible default, but these can be overridden by `options.poolConfig`.
        max: 10,
        idleTimeoutMillis: 30000,
        errorOnUnusedParameters: true,
        ...options.poolConfig,
      },
      (err) => {
        throw err;
      },
    );
  }

  return poolConfig;
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
  { closePool = true, force = false, database }: DropDatabaseOptions = {},
): Promise<void> {
  if (closePool) {
    await defaultPool.closeAsync();
  }

  const databaseName = database ?? getDatabaseNameForCurrentTestWorker(options.database);
  if ('PL_KEEP_TEST_DB' in process.env && !force) {
    // eslint-disable-next-line no-console
    console.log(`PL_KEEP_TEST_DB environment variable set, not dropping database ${databaseName}`);
    return;
  }

  const client = new pg.Client({
    ...getPoolConfig(options),
    database: options.defaultDatabase ?? POSTGRES_DATABASE,
  });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(databaseName)}`);
  await client.end();
}

function getDatabaseNameForCurrentTestWorker(namespace: string): string {
  // https://playwright.dev/docs/test-parallel#isolate-test-data-between-parallel-workers
  const workerId = process.env.TEST_WORKER_INDEX ?? process.env.VITEST_POOL_ID ?? '1';
  return `${namespace}_${workerId}`;
}

function getPoolConfig(options: PostgresTestUtilsOptions): PostgresTestPoolConfig {
  return {
    user: options.user ?? POSTGRES_USER,
    host: options.host ?? POSTGRES_HOST,
    database: getDatabaseNameForCurrentTestWorker(options.database),
  };
}

export interface PostgresTestUtils {
  createDatabase: (options?: CreateDatabaseOptions) => Promise<pg.PoolConfig>;
  resetDatabase: () => Promise<void>;
  dropDatabase: (options?: DropDatabaseOptions) => Promise<void>;
  getDatabaseNameForCurrentTestWorker: () => string;
  getPoolConfig: () => pg.PoolConfig;
}

export function makePostgresTestUtils(options: PostgresTestUtilsOptions): PostgresTestUtils {
  return {
    createDatabase: (createOptions?: CreateDatabaseOptions) =>
      createDatabase(options, createOptions),
    resetDatabase: () => resetDatabase(options),
    dropDatabase: (dropOptions?: DropDatabaseOptions) => dropDatabase(options, dropOptions),
    getDatabaseNameForCurrentTestWorker: () =>
      getDatabaseNameForCurrentTestWorker(options.database),
    getPoolConfig: () => getPoolConfig(options),
  };
}
