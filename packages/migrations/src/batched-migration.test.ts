import { assert } from 'chai';
import * as sqldb from '@prairielearn/postgres';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

import { BatchedMigration, BatchedMigrationExecutor } from './batched-migration';
import { SCHEMA_MIGRATIONS_PATH } from './index';

const WORKER_ID = process.env.MOCHA_WORKER_ID || '1';
const POSTGRES_DATABASE = `prairielearn_migrations_${WORKER_ID}`;
const POSTGRES_INIT_CONNECTION_STRING = 'postgres://postgres@localhost/postgres';

// This was borrowed from `tests/helperDb.js` in the main database. When that's
// moved to a shared package, we should be able to reuse that functionality.
async function makeTestDatabase() {
  const POSTGRES_USER = 'postgres';
  const POSTGRES_HOST = 'localhost';

  const client = new pg.Client(POSTGRES_INIT_CONNECTION_STRING);
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${POSTGRES_DATABASE};`);
  await client.query(`CREATE DATABASE ${POSTGRES_DATABASE};`);
  await client.end();

  console.log('here');
  await sqldb.initAsync(
    {
      user: POSTGRES_USER,
      database: POSTGRES_DATABASE,
      host: POSTGRES_HOST,
      max: 10,
      idleTimeoutMillis: 30000,
    },
    (err) => {
      throw err;
    }
  );
  console.log('now here');

  // Run local migrations to set up the database. Once the real migration-running
  // code is lifted into this package, we can use that instead.
  const migrations = fs.readdirSync(SCHEMA_MIGRATIONS_PATH);
  const sortedMigrations = migrations.sort((a, b) => {
    const aTimestamp = parseInt(a.split('_')[0]);
    const bTimestamp = parseInt(b.split('_')[0]);
    return aTimestamp - bTimestamp;
  });
  for (const migrationName of sortedMigrations) {
    const migrationPath = path.join(SCHEMA_MIGRATIONS_PATH, migrationName);
    const migration = fs.readFileSync(migrationPath, 'utf8');
    await sqldb.queryAsync(migration, {});
  }
}

async function destroyTestDatabase() {
  await sqldb.closeAsync();

  const client = new pg.Client(POSTGRES_INIT_CONNECTION_STRING);
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${POSTGRES_DATABASE}`);
  await client.end();
}

class TestBatchMigration extends BatchedMigration {
  async getMin() {
    return '0';
  }

  async getMax() {
    return '10000';
  }

  async execute(start: BigInt, end: BigInt) {
    console.log('running for range', start, end);
  }
}

async function getBatchedMigrationState() {
  const migration = await sqldb.queryOneRowAsync(
    'SELECT * FROM batched_migrations WHERE name = $name;',
    { name: 'test_batch_migration' }
  );
  return migration.rows[0];
}

describe('BatchedMigrationExecutor', () => {
  beforeEach(async () => makeTestDatabase());
  afterEach(async () => destroyTestDatabase());

  it('runs one iteration of a batched migration', async () => {
    assert.equal(true, true);

    const migration = new TestBatchMigration();
    const executor = new BatchedMigrationExecutor('test_batch_migration', migration);
    await executor.run({ iterations: 1 });

    const migrationState = await getBatchedMigrationState();
    assert.equal(migrationState.current, '1000');
  });

  it('runs an entire batched migration', async () => {
    const migration = new TestBatchMigration();
    const executor = new BatchedMigrationExecutor('test_batch_migration', migration);
    await executor.run();

    const migrationState = await getBatchedMigrationState();
    assert.equal(migrationState.current, '10000');
  });
});
