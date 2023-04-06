import { assert } from 'chai';
import { makePostgresTestUtils, queryOneRowAsync } from '@prairielearn/postgres';
import * as namedLocks from '@prairielearn/named-locks';

import { BatchedMigration } from './batched-migration';
import { BatchedMigrationRunner } from './batched-migration-runner';
import { SCHEMA_MIGRATIONS_PATH, init } from '../index';

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_migrations',
});

class TestBatchMigration extends BatchedMigration {
  async getMin() {
    return '0';
  }

  async getMax() {
    return '10000';
  }

  async execute(_start: BigInt, _end: BigInt) {}
}

async function getBatchedMigrationState() {
  const migration = await queryOneRowAsync('SELECT * FROM batched_migrations WHERE name = $name;', {
    name: 'test_batch_migration',
  });
  return migration.rows[0];
}

describe('BatchedMigrationExecutor', () => {
  beforeEach(async () => {
    await postgresTestUtils.createDatabase();
    await namedLocks.init(postgresTestUtils.getPoolConfig(), (err) => {
      throw err;
    });
    await init([SCHEMA_MIGRATIONS_PATH], 'prairielearn_migrations');
  });
  afterEach(async () => {
    await namedLocks.close();
    await postgresTestUtils.dropDatabase();
  });

  it('runs one iteration of a batched migration', async () => {
    assert.equal(true, true);

    const migration = new TestBatchMigration();
    const executor = new BatchedMigrationRunner('test_batch_migration', migration);
    await executor.run({ iterations: 1 });

    const migrationState = await getBatchedMigrationState();
    assert.equal(migrationState.current, '1000');
  });

  it('runs an entire batched migration', async () => {
    const migration = new TestBatchMigration();
    const executor = new BatchedMigrationRunner('test_batch_migration', migration);
    await executor.run();

    const migrationState = await getBatchedMigrationState();
    assert.equal(migrationState.current, '10000');
  });
});
