// @ts-check
const pg = require('pg');
const path = require('path');
const _ = require('lodash');
const util = require('util');

const sqldb = require('../prairielib/lib/sql-db');
const migrations = require('../prairielib/lib/migrations');
const sprocs = require('../sprocs');
const namedLocks = require('../lib/named-locks');

const postgresqlUser = 'postgres';
const postgresqlDatabase = 'pltest';
const postgresqlDatabaseTemplate = 'pltest_template';
const postgresqlHost = 'localhost';
const initConString = 'postgres://postgres@localhost/postgres';

async function runMigrationsAndSprocs(dbName, mochaThis, runMigrations) {
  mochaThis.timeout(20000);
  const pgConfig = {
    user: postgresqlUser,
    database: dbName,
    host: postgresqlHost,
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
    // @ts-expect-error
    await util.promisify(migrations.init)(path.join(__dirname, '..', 'migrations'), 'prairielearn');
  }

  await sqldb.setRandomSearchSchemaAsync('test');
  await util.promisify(sprocs.init)();

  await namedLocks.close();
  await sqldb.closeAsync();
}

async function createFullDatabase(dbName, dropFirst, mochaThis) {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  mochaThis.timeout(20000);

  const client = new pg.Client(initConString);
  await client.connect();
  if (dropFirst) {
    await client.query('DROP DATABASE IF EXISTS ' + dbName + ';');
  }
  await client.query('CREATE DATABASE ' + dbName + ';');
  await client.end();
  await runMigrationsAndSprocs(dbName, mochaThis, true);
}

async function createFromTemplate(dbName, dbTemplateName, dropFirst, mochaThis) {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  mochaThis.timeout(20000);
  const client = new pg.Client(initConString);
  await client.connect();
  if (dropFirst) {
    await client.query('DROP DATABASE IF EXISTS ' + dbName + ';');
  }
  await client.query(`CREATE DATABASE ${dbName} TEMPLATE ${dbTemplateName};`);
  await client.end();
  await runMigrationsAndSprocs(dbName, mochaThis, false);
}

async function establishSql(dbName) {
  const pgConfig = {
    user: postgresqlUser,
    database: dbName,
    host: postgresqlHost,
    max: 10,
    idleTimeoutMillis: 30000,
  };
  function idleErrorHandler(err) {
    throw err;
  }
  await sqldb.initAsync(pgConfig, idleErrorHandler);

  // Ideally this would happen only over in `helperServer`, but we need to use
  // the same database details, so this is a convenient place to do it.
  await namedLocks.init(pgConfig, idleErrorHandler);
}

async function closeSql() {
  await namedLocks.close();
  await sqldb.closeAsync();
}

async function dropDatabase(dbName, mochaThis, forceDrop = false) {
  if (_.has(process.env, 'PL_KEEP_TEST_DB') && !forceDrop) {
    // eslint-disable-next-line no-console
    console.log(`PL_KEEP_TEST_DB enviroment variable set, not dropping database ${dbName}`);
    return;
  }

  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  mochaThis.timeout(20000);

  const client = new pg.Client(initConString);
  await client.connect();
  await client.query('DROP DATABASE IF EXISTS ' + dbName + ';');
  await client.end();
}

async function databaseExists(dbName) {
  const client = new pg.Client(initConString);
  await client.connect();
  const result = await client.query(
    `SELECT exists(SELECT * FROM pg_catalog.pg_database WHERE datname = '${dbName}');`
  );
  const existsResult = result.rows[0].exists;
  await client.end();
  return existsResult;
}

async function setupDatabases(mochaThis) {
  const exists = await databaseExists(postgresqlDatabaseTemplate);
  if (exists) {
    await createFromTemplate(postgresqlDatabase, postgresqlDatabaseTemplate, true, mochaThis);
  } else {
    await createFullDatabase(postgresqlDatabaseTemplate, true, mochaThis);
    await createFromTemplate(postgresqlDatabase, postgresqlDatabaseTemplate, true, mochaThis);
  }
  await establishSql(postgresqlDatabase);
}

module.exports = {
  before: async function before() {
    var that = this;
    await setupDatabases(that);
  },

  // This version will only (re)create the database with migrations; it will
  // then close the connection in sqldb. This is necessary for database
  // schema verification, where databaseDiff will set up a connection to the
  // desired database.
  beforeOnlyCreate: async function beforeOnlyCreate() {
    var that = this;
    await setupDatabases(that);
    await closeSql();
  },

  after: async function after() {
    var that = this;
    await closeSql();
    await dropDatabase(postgresqlDatabase, that);
  },

  dropTemplate: async function dropTemplate() {
    var that = this;
    await closeSql();
    await dropDatabase(
      postgresqlDatabaseTemplate,
      that,
      // Always drop the template regardless of PL_KEEP_TEST_DB env
      true
    );
  },
};
