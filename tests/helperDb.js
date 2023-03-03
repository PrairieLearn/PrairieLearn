// @ts-check
const pg = require('pg');
const path = require('path');
const _ = require('lodash');
const util = require('util');

const sqldb = require('@prairielearn/postgres');
const migrations = require('../prairielib/lib/migrations');
const { SCHEMA_MIGRATIONS_PATH } = require('@prairielearn/migrations');
const sprocs = require('../sprocs');
const namedLocks = require('../lib/named-locks');

const POSTGRES_USER = 'postgres';
const POSTGRES_HOST = 'localhost';
const POSTGRES_INIT_CONNECTION_STRING = 'postgres://postgres@localhost/postgres';

const POSTGRES_DATABASE = 'pltest';
const POSTGRES_DATABASE_TEMPLATE = 'pltest_template';

async function runMigrationsAndSprocs(dbName, mochaThis, runMigrations) {
  mochaThis.timeout?.(20000);
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
    await util.promisify(migrations.init)(
      [path.join(__dirname, '..', 'migrations'), SCHEMA_MIGRATIONS_PATH],
      'prairielearn'
    );
  }

  await sqldb.setRandomSearchSchemaAsync('test');
  await util.promisify(sprocs.init)();

  await namedLocks.close();
  await sqldb.closeAsync();
}

async function createFullDatabase(dbName, dropFirst, mochaThis) {
  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  mochaThis.timeout?.(20000);

  const client = new pg.Client(POSTGRES_INIT_CONNECTION_STRING);
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
  mochaThis.timeout?.(20000);
  const client = new pg.Client(POSTGRES_INIT_CONNECTION_STRING);
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
    console.log(`PL_KEEP_TEST_DB enviroment variable set, not dropping database ${dbName}`);
    return;
  }

  // long timeout because DROP DATABASE might take a long time to error
  // if other processes have an open connection to that database
  mochaThis.timeout?.(20000);

  const client = new pg.Client(POSTGRES_INIT_CONNECTION_STRING);
  await client.connect();
  await client.query('DROP DATABASE IF EXISTS ' + dbName + ';');
  await client.end();
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

async function setupDatabases(mochaThis) {
  const templateExists = await databaseExists(POSTGRES_DATABASE_TEMPLATE);
  const dbName = module.exports.getDatabaseNameForCurrentWorker();
  if (templateExists) {
    await createFromTemplate(dbName, POSTGRES_DATABASE_TEMPLATE, true, mochaThis);
  } else {
    await module.exports.createTemplate(mochaThis);
    await createFromTemplate(dbName, POSTGRES_DATABASE_TEMPLATE, true, mochaThis);
  }
  await establishSql(dbName);
}

module.exports.before = async function before() {
  var that = this;
  await setupDatabases(that);
};

// This version will only (re)create the database with migrations; it will
// then close the connection in sqldb. This is necessary for database
// schema verification, where databaseDiff will set up a connection to the
// desired database.
module.exports.beforeOnlyCreate = async function beforeOnlyCreate() {
  var that = this;
  await setupDatabases(that);
  await closeSql();
};

module.exports.after = async function after() {
  var that = this;
  await closeSql();
  const dbName = module.exports.getDatabaseNameForCurrentWorker();
  await dropDatabase(dbName, that);
};

module.exports.createTemplate = async function createTemplate(mochaThis) {
  await createFullDatabase(POSTGRES_DATABASE_TEMPLATE, true, mochaThis);
};

module.exports.dropTemplate = async function dropTemplate() {
  var that = this;
  await closeSql();
  await dropDatabase(
    POSTGRES_DATABASE_TEMPLATE,
    that,
    // Always drop the template regardless of PL_KEEP_TEST_DB env
    true
  );
};

module.exports.resetDatabase = async function resetDatabase() {
  const client = new pg.Client({
    user: POSTGRES_USER,
    database: module.exports.getDatabaseNameForCurrentWorker(),
    host: POSTGRES_HOST,
  });
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

  // This is the sole piece of database state that's actually created in a
  // migration (`153_institutions__create`) - when we TRUNCATE the `institutions`
  // table above, we lose the default institution, so we add it back here.
  await client.query(
    "INSERT INTO institutions (id, long_name, short_name) VALUES (1, 'Default', 'Default') ON CONFLICT DO NOTHING;"
  );

  await client.end();
};

module.exports.getDatabaseNameForWorker = function getDatabaseNameForWorker(workerId = '1') {
  return `${POSTGRES_DATABASE}_${workerId}`;
};

module.exports.getDatabaseNameForCurrentWorker = function getDatabaseNameForCurrentWorker() {
  return module.exports.getDatabaseNameForWorker(process.env.MOCHA_WORKER_ID);
};
