import path from 'node:path';

import { afterAll, afterEach, assert, beforeAll, describe, expect, it } from 'vitest';

import { withoutLogging } from '@prairielearn/logger';
import * as namedLocks from '@prairielearn/named-locks';
import { makePostgresTestUtils } from '@prairielearn/postgres';

import { SCHEMA_MIGRATIONS_PATH, init } from '../index.js';

import { selectAllBatchedMigrations } from './batched-migration.js';
import { BatchedMigrationsRunner } from './batched-migrations-runner.js';

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_migrations',
});

describe('BatchedMigrationsRunner', () => {
  beforeAll(async () => {
    const poolConfig = await postgresTestUtils.createDatabase();
    await namedLocks.init(poolConfig, (err) => {
      throw err;
    });
    await init({ directories: [SCHEMA_MIGRATIONS_PATH], project: 'prairielearn_migrations' });
  });

  afterEach(async () => {
    await postgresTestUtils.resetDatabase();
  });

  afterAll(async () => {
    await namedLocks.close();
    await postgresTestUtils.dropDatabase();
  });

  it('enqueues migrations', async () => {
    const runner = new BatchedMigrationsRunner({
      project: 'test',
      directories: [path.join(import.meta.dirname, 'fixtures')],
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
    assert.equal(migrations[1].filename, '20230406184107_failing_migration.ts');
    assert.equal(migrations[1].status, 'pending');
    assert.equal(migrations[2].timestamp, '20230407230446');
    assert.equal(migrations[2].filename, '20230407230446_no_rows_migration.ts');
    assert.equal(migrations[2].status, 'succeeded');
  });

  it('safely enqueues migrations multiple times', async () => {
    const runner = new BatchedMigrationsRunner({
      project: 'test',
      directories: [path.join(import.meta.dirname, 'fixtures')],
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
      directories: [path.join(import.meta.dirname, 'fixtures')],
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
      directories: [path.join(import.meta.dirname, 'fixtures')],
    });

    await runner.enqueueBatchedMigration('20230406184107_failing_migration');

    await expect(
      withoutLogging(() =>
        runner.finalizeBatchedMigration('20230406184107_failing_migration', {
          logProgress: false,
        }),
      ),
    ).rejects.toThrow("but it is 'failed'");
    const migrations = await selectAllBatchedMigrations('test');
    assert.lengthOf(migrations, 1);
    assert.equal(migrations[0].timestamp, '20230406184107');
    assert.equal(migrations[0].status, 'failed');
  });
});
