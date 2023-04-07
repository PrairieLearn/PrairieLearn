import { assert } from 'chai';
import {
  makePostgresTestUtils,
  queryAsync,
  queryValidatedOneRow,
  queryValidatedRows,
} from '@prairielearn/postgres';
import * as namedLocks from '@prairielearn/named-locks';

import {
  BatchedMigration,
  BatchedMigrationRowSchema,
  insertBatchedMigration,
  updateBatchedMigrationStatus,
} from './batched-migration';
import { BatchedMigrationJobRowSchema } from './batched-migration-job';
import { BatchedMigrationRunner } from './batched-migration-runner';
import { SCHEMA_MIGRATIONS_PATH, init } from '../index';

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_migrations',
});

class TestBatchMigration extends BatchedMigration {
  private failingIds: bigint[] = [];
  private _executionCount = 0;

  async getParameters() {
    return {
      min: 1n,
      max: 10000n,
      batchSize: 1000,
    };
  }

  async execute(start: bigint, end: bigint) {
    this._executionCount += 1;
    const shouldFail = this.failingIds.some((id) => id >= start && id <= end);
    if (shouldFail) {
      throw new Error('Execution failure');
    }
  }

  setFailingIds(ids: bigint[]) {
    this.failingIds = ids;
  }

  get executionCount() {
    return this._executionCount;
  }
}

async function getBatchedMigration(migrationId: string) {
  return queryValidatedOneRow(
    'SELECT * FROM batched_migrations WHERE id = $id;',
    { id: migrationId },
    BatchedMigrationRowSchema
  );
}

async function getBatchedMigrationJobs(migrationId: string) {
  return queryValidatedRows(
    'SELECT * FROM batched_migration_jobs WHERE batched_migration_id = $batched_migration_id ORDER BY id ASC;',
    { batched_migration_id: migrationId },
    BatchedMigrationJobRowSchema
  );
}

async function resetFailedBatchedMigrationJobs(migrationId: string) {
  await queryAsync(
    "UPDATE batched_migration_jobs SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE batched_migration_id = $batched_migration_id AND status = 'failed'",
    {
      batched_migration_id: migrationId,
    }
  );
}

async function insertTestBatchedMigration() {
  const migrationImplementation = new TestBatchMigration();
  const parameters = await migrationImplementation.getParameters();
  return insertBatchedMigration({
    project: 'test',
    filename: '20230406184103_test_batch_migration.js',
    timestamp: '20230406184103',
    batch_size: parameters.batchSize,
    min_value: parameters.min,
    max_value: parameters.max,
  });
}

describe('BatchedMigrationExecutor', () => {
  before(async () => {
    await postgresTestUtils.createDatabase();
    await namedLocks.init(postgresTestUtils.getPoolConfig(), (err) => {
      throw err;
    });
    await init([SCHEMA_MIGRATIONS_PATH], 'prairielearn_migrations');
  });

  beforeEach(async () => {
    await postgresTestUtils.resetDatabase();
  });

  after(async () => {
    await namedLocks.close();
    await postgresTestUtils.dropDatabase();
  });

  it('runs one iteration of a batched migration', async () => {
    const migration = await insertTestBatchedMigration();
    await updateBatchedMigrationStatus(migration.id, 'running');
    migration.status = 'running';

    const migrationInstance = new TestBatchMigration();
    const executor = new BatchedMigrationRunner(migration, migrationInstance);
    await executor.run({ iterations: 1 });

    const jobs = await getBatchedMigrationJobs(migration.id);
    assert.lengthOf(jobs, 1);

    const finalMigration = await getBatchedMigration(migration.id);
    assert.equal(finalMigration.status, 'running');

    assert.equal(migrationInstance.executionCount, 1);
  });

  it('runs an entire batched migration', async () => {
    const migration = await insertTestBatchedMigration();
    await updateBatchedMigrationStatus(migration.id, 'running');
    migration.status = 'running';

    const migrationInstance = new TestBatchMigration();
    const runner = new BatchedMigrationRunner(migration, migrationInstance);
    await runner.run();

    const jobs = await getBatchedMigrationJobs(migration.id);
    assert.lengthOf(jobs, 10);
    assert.equal(jobs[0].min_value, 1n);
    assert.equal(jobs[0].max_value, 1000n);
    assert.equal(jobs.at(-1)?.min_value, 9001n);
    assert.equal(jobs.at(-1)?.max_value, 10000n);
    assert.isTrue(jobs.every((job) => job.started_at !== null));
    assert.isTrue(jobs.every((job) => job.finished_at !== null));
    assert.isTrue(jobs.every((job) => job.status === 'succeeded'));

    const finalMigration = await getBatchedMigration(migration.id);
    assert.equal(finalMigration.status, 'succeeded');
  });

  it('handles failing execution', async () => {
    const migration = await insertTestBatchedMigration();
    await updateBatchedMigrationStatus(migration.id, 'running');
    migration.status = 'running';

    const migrationInstance = new TestBatchMigration();
    migrationInstance.setFailingIds([1n, 5010n]);
    const runner = new BatchedMigrationRunner(migration, migrationInstance);
    await runner.run();

    const jobs = await getBatchedMigrationJobs(migration.id);
    const failedJobs = jobs.filter((job) => job.status === 'failed');
    const successfulJobs = jobs.filter((job) => job.status === 'succeeded');
    assert.lengthOf(jobs, 10);
    assert.lengthOf(failedJobs, 2);
    assert.lengthOf(successfulJobs, 8);
    assert.equal(migrationInstance.executionCount, 10);

    const failedMigration = await getBatchedMigration(migration.id);
    assert.equal(failedMigration.status, 'failed');

    // Retry the failed jobs; ensure they succeed this time.
    await resetFailedBatchedMigrationJobs(migration.id);
    await updateBatchedMigrationStatus(migration.id, 'running');
    migration.status = 'running';

    migrationInstance.setFailingIds([]);
    const retryRunner = new BatchedMigrationRunner(migration, migrationInstance);
    await retryRunner.run();

    const finalJobs = await getBatchedMigrationJobs(migration.id);
    const finalFailedJobs = finalJobs.filter((job) => job.status === 'failed');
    const finalSuccessfulJobs = finalJobs.filter((job) => job.status === 'succeeded');
    assert.lengthOf(finalJobs, 10);
    assert.lengthOf(finalFailedJobs, 0);
    assert.lengthOf(finalSuccessfulJobs, 10);

    const finalMigration = await getBatchedMigration(migration.id);
    assert.equal(finalMigration.status, 'succeeded');

    // The runner should have run only the previously failed jobs, which
    // works out to 2 additional execution.
    assert.equal(migrationInstance.executionCount, 12);
  });
});
