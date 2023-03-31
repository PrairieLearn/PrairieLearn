// @ts-check
const pg = require('pg');
const path = require('path');
const util = require('util');

const sqldb = require('@prairielearn/postgres');
const migrations = require('@prairielearn/migrations');
const sprocs = require('../sprocs');
const namedLocks = require('@prairielearn/named-locks');

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
      "INSERT INTO institutions (id, long_name, short_name) VALUES (1, 'Default', 'Default') ON CONFLICT DO NOTHING;"
    );
  },
});

/**
 *
 * @param {string} dbName
 * @param {boolean} runMigrations
 */
async function runMigrationsAndSprocs(dbName, runMigrations) {
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

  if (runMigrations) {
    await migrations.init(path.join(__dirname, '..', 'migrations'), 'prairielearn');
  }

  await sqldb.setRandomSearchSchemaAsync('test');
  await util.promisify(sprocs.init)();

  await namedLocks.close();
  await sqldb.closeAsync();
}

/**
 *
 * @param {string} dbName
 * @param {string} dbTemplateName
 * @param {boolean} dropFirst
 */
async function createFromTemplate(dbName, dbTemplateName, dropFirst) {
  await postgresTestUtils.createDatabase({
    dropExistingDatabase: dropFirst,
    database: dbName,
    templateDatabase: dbTemplateName,
    configurePool: true,
    prepare: () => runMigrationsAndSprocs(dbName, false),
  });
}

async function closeSql() {
  await namedLocks.close();
  await sqldb.closeAsync();
}

async function databaseExists(dbName) {
  const client = new pg.Client(POSTGRES_INIT_CONNECTION_STRING);
  await client.connect();
  const result = await client.query(
    `SELECT exists(SELECT * FROM pg_catalog.pg_database WHERE datname = '${dbName}');`
  );
  const existsResult = result.rows[0].exists;
  await client.end();
  return existsResult;
}

async function setupDatabases() {
  const templateExists = await databaseExists(POSTGRES_DATABASE_TEMPLATE);
  const dbName = module.exports.getDatabaseNameForCurrentWorker();
  if (templateExists) {
    await createFromTemplate(dbName, POSTGRES_DATABASE_TEMPLATE, true);
  } else {
    await module.exports.createTemplate();
    await createFromTemplate(dbName, POSTGRES_DATABASE_TEMPLATE, true);
  }

  // Ideally this would happen only over in `helperServer`, but we need to use
  // the same database details, so this is a convenient place to do it.
  await namedLocks.init(postgresTestUtils.getPoolConfig(), (err) => {
    throw err;
  });
}

/**
 * @this {import('mocha').Context}
 */
module.exports.before = async function before() {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  this.timeout?.(20000);
  await setupDatabases();
};

/**
 * This version will only (re)create the database with migrations; it will
 * then close the connection in sqldb. This is necessary for database
 * schema verification, where databaseDiff will set up a connection to the
 * desired database.
 *
 * @this {import('mocha').Context}
 */
module.exports.beforeOnlyCreate = async function beforeOnlyCreate() {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  this.timeout?.(20000);
  await setupDatabases();
  await closeSql();
};

/**
 * @this {import('mocha').Context}
 */
module.exports.after = async function after() {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  this.timeout?.(20000);
  await closeSql();
  await postgresTestUtils.dropDatabase();
};

module.exports.createTemplate = async function createTemplate() {
  await postgresTestUtils.createDatabase({
    dropExistingDatabase: true,
    database: POSTGRES_DATABASE_TEMPLATE,
    configurePool: false,
    prepare: () => runMigrationsAndSprocs(POSTGRES_DATABASE_TEMPLATE, true),
  });
};

/**
 * @this {import('mocha').Context}
 */
module.exports.dropTemplate = async function dropTemplate() {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  this.timeout?.(20000);
  await closeSql();
  await postgresTestUtils.dropDatabase({
    database: POSTGRES_DATABASE_TEMPLATE,
    // Always drop the template regardless of PL_KEEP_TEST_DB env
    force: true,
  });
};

module.exports.resetDatabase = async function resetDatabase() {
  await postgresTestUtils.resetDatabase();
};

module.exports.getDatabaseNameForCurrentWorker = function getDatabaseNameForCurrentWorker() {
  return postgresTestUtils.getDatabaseNameForCurrentMochaWorker();
};
