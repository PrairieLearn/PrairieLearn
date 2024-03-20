import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import path from 'node:path';
import { makePostgresTestUtils } from '@prairielearn/postgres';
import * as namedLocks from '@prairielearn/named-locks';

import { SCHEMA_MIGRATIONS_PATH, init } from '../index';
import { BatchedMigrationsRunner } from './batched-migrations-runner';
import { selectAllBatchedMigrations } from './batched-migration';

chai.use(chaiAsPromised);

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_migrations',
});

describe('BatchedMigrationsRunner', () => {
  before(async () => {
    await postgresTestUtils.createDatabase();
    await namedLocks.init(postgresTestUtils.getPoolConfig(), (err) => {
      throw err;
    });
    await init([SCHEMA_MIGRATIONS_PATH], 'prairielearn_migrations');
  });

  afterEach(async () => {
    await postgresTestUtils.resetDatabase();
  });

  after(async () => {
    await namedLocks.close();
    await postgresTestUtils.dropDatabase();
  });

  it('enqueues migrations', async () => {
    const runner = new BatchedMigrationsRunner({
      project: 'test',
      directories: [path.join(__dirname, 'fixtures')],
    });

    await runner.enqueueBatchedMigration('20230406184103_successful_migration');
    await runner.enqueueBatchedMigration('20230406184107_failing_migration');
    await runner.enqueueBatchedMigration('20230407230446_no_rows_migration');

    const migrations = await selectAllBatchedMigrations('test');

    assert.lengthOf(migrations, 3);
    assert.equal(migrations[0].timestamp, '20230406184103');
    assert.equal(migrations[0].filename, '20230406184103_successful_migration.ts');
    assert.equal(migrations[0].status, 'pending');
    assert.equal(migrations[1].timestamp, '20230406184107');
    assert.equal(migrations[1].filename, '20230406184107_failing_migration.js');
    assert.equal(migrations[1].status, 'pending');
    assert.equal(migrations[2].timestamp, '20230407230446');
    assert.equal(migrations[2].filename, '20230407230446_no_rows_migration.ts');
    assert.equal(migrations[2].status, 'succeeded');
  });

  it('safely enqueues migrations multiple times', async () => {
    const runner = new BatchedMigrationsRunner({
      project: 'test',
      directories: [path.join(__dirname, 'fixtures')],
    });

    await runner.enqueueBatchedMigration('20230406184103_successful_migration');
    await runner.enqueueBatchedMigration('20230406184103_successful_migration');
    await runner.enqueueBatchedMigration('20230406184103_successful_migration');

    const migrations = await selectAllBatchedMigrations('test');

    assert.lengthOf(migrations, 1);
  });

  it('finalizes a successful migration', async () => {
    const runner = new BatchedMigrationsRunner({
      project: 'test',
      directories: [path.join(__dirname, 'fixtures')],
    });

    await runner.enqueueBatchedMigration('20230406184103_successful_migration');
    await runner.finalizeBatchedMigration('20230406184103_successful_migration', {
      logProgress: false,
    });

    const migrations = await selectAllBatchedMigrations('test');
    assert.lengthOf(migrations, 1);
    assert.equal(migrations[0].timestamp, '20230406184103');
    assert.equal(migrations[0].status, 'succeeded');
  });

  it('finalizes a failing migration', async () => {
    const runner = new BatchedMigrationsRunner({
      project: 'test',
      directories: [path.join(__dirname, 'fixtures')],
    });

    await runner.enqueueBatchedMigration('20230406184107_failing_migration');

    await assert.isRejected(
      runner.finalizeBatchedMigration('20230406184107_failing_migration', {
        logProgress: false,
      }),
      "but it is 'failed'",
    );

    const migrations = await selectAllBatchedMigrations('test');
    assert.lengthOf(migrations, 1);
    assert.equal(migrations[0].timestamp, '20230406184107');
    assert.equal(migrations[0].status, 'failed');
  });
});
