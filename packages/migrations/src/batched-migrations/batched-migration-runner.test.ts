import { assert } from 'chai';
import { makePostgresTestUtils, queryAsync, queryRow, queryRows } from '@prairielearn/postgres';
import * as namedLocks from '@prairielearn/named-locks';
import * as error from '@prairielearn/error';

import {
  BatchedMigrationRowSchema,
  insertBatchedMigration,
  makeBatchedMigration,
  updateBatchedMigrationStatus,
} from './batched-migration';
import { BatchedMigrationJobRowSchema } from './batched-migration-job';
import { BatchedMigrationRunner } from './batched-migration-runner';
import { SCHEMA_MIGRATIONS_PATH, init } from '../index';

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_migrations',
});

function makeTestBatchMigration() {
  let executionCount = 0;
  let failingIds: bigint[] = [];

  return makeBatchedMigration({
    async getParameters() {
      return {
        min: 1n,
        max: 10000n,
        batchSize: 1000,
      };
    },
    async execute(start: bigint, end: bigint) {
      executionCount += 1;
      const shouldFail = failingIds.some((id) => id >= start && id <= end);
      if (shouldFail) {
        // Throw an error with some data to make sure it gets persisted. We
        // specifically use BigInt values here to make sure that they are
        // correctly serialized to strings.
        throw error.makeWithData('Execution failure', { start, end });
      }
    },
    setFailingIds(ids: bigint[]) {
      failingIds = ids;
    },
    get executionCount() {
      return executionCount;
    },
  });
}

async function getBatchedMigration(migrationId: string) {
  return await queryRow(
    'SELECT * FROM batched_migrations WHERE id = $id;',
    { id: migrationId },
    BatchedMigrationRowSchema,
  );
}

async function getBatchedMigrationJobs(migrationId: string) {
  return await queryRows(
    'SELECT * FROM batched_migration_jobs WHERE batched_migration_id = $batched_migration_id ORDER BY id ASC;',
    { batched_migration_id: migrationId },
    BatchedMigrationJobRowSchema,
  );
}

async function resetFailedBatchedMigrationJobs(migrationId: string) {
  await queryAsync(
    "UPDATE batched_migration_jobs SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE batched_migration_id = $batched_migration_id AND status = 'failed'",
    {
      batched_migration_id: migrationId,
    },
  );
}

async function insertTestBatchedMigration() {
  const migrationImplementation = makeTestBatchMigration();
  const parameters = await migrationImplementation.getParameters();
  const migration = await insertBatchedMigration({
    project: 'test',
    filename: '20230406184103_test_batch_migration.js',
    timestamp: '20230406184103',
    batch_size: parameters.batchSize,
    min_value: parameters.min,
    max_value: parameters.max,
    status: 'running',
  });
  if (!migration) throw new Error('Failed to insert batched migration');
  return migration;
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

    const migrationImplementation = makeTestBatchMigration();
    const executor = new BatchedMigrationRunner(migration, migrationImplementation);
    await executor.run({ iterations: 1 });

    const jobs = await getBatchedMigrationJobs(migration.id);
    assert.lengthOf(jobs, 1);

    const finalMigration = await getBatchedMigration(migration.id);
    assert.equal(finalMigration.status, 'running');

    assert.equal(migrationImplementation.executionCount, 1);
  });

  it('runs an entire batched migration', async () => {
    const migration = await insertTestBatchedMigration();

    const migrationImplementation = makeTestBatchMigration();
    const runner = new BatchedMigrationRunner(migration, migrationImplementation);
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
    assert.isTrue(jobs.every((job) => job.attempts === 1));

    const finalMigration = await getBatchedMigration(migration.id);
    assert.equal(finalMigration.status, 'succeeded');
  });

  it('handles failing execution', async () => {
    let migration = await insertTestBatchedMigration();

    const migrationImplementation = makeTestBatchMigration();
    migrationImplementation.setFailingIds([1n, 5010n]);
    const runner = new BatchedMigrationRunner(migration, migrationImplementation);
    await runner.run();

    const jobs = await getBatchedMigrationJobs(migration.id);
    const failedJobs = jobs.filter((job) => job.status === 'failed');
    const successfulJobs = jobs.filter((job) => job.status === 'succeeded');
    assert.lengthOf(jobs, 10);
    assert.lengthOf(failedJobs, 2);
    assert.lengthOf(successfulJobs, 8);
    assert.equal(migrationImplementation.executionCount, 10);
    assert.isTrue(jobs.every((job) => job.attempts === 1));
    failedJobs.forEach((job) => {
      const jobData = job.data as any;
      assert.isObject(jobData);
      assert.isObject(jobData.error);
      assert.hasAllKeys(jobData.error, ['name', 'message', 'stack', 'data']);
      assert.equal(jobData.error.name, 'Error');
      assert.equal(jobData.error.message, 'Execution failure');
      assert.equal(jobData.error.data.start, job.min_value.toString());
      assert.equal(jobData.error.data.end, job.max_value.toString());
    });

    const failedMigration = await getBatchedMigration(migration.id);
    assert.equal(failedMigration.status, 'failed');

    // Retry the failed jobs; ensure they succeed this time.
    await resetFailedBatchedMigrationJobs(migration.id);
    migration = await updateBatchedMigrationStatus(migration.id, 'running');

    migrationImplementation.setFailingIds([]);
    const retryRunner = new BatchedMigrationRunner(migration, migrationImplementation);
    await retryRunner.run();

    const finalJobs = await getBatchedMigrationJobs(migration.id);
    const finalFailedJobs = finalJobs.filter((job) => job.status === 'failed');
    const finalSuccessfulJobs = finalJobs.filter((job) => job.status === 'succeeded');
    const retriedJobs = finalJobs.filter((job) => job.attempts === 2);
    assert.lengthOf(finalJobs, 10);
    assert.lengthOf(finalFailedJobs, 0);
    assert.lengthOf(finalSuccessfulJobs, 10);
    assert.lengthOf(retriedJobs, 2);
    assert.isTrue(finalJobs.every((job) => job.data === null));

    migration = await getBatchedMigration(migration.id);
    assert.equal(migration.status, 'succeeded');

    // The runner should have run only the previously failed jobs, which
    // works out to 2 additional execution.
    assert.equal(migrationImplementation.executionCount, 12);
  });
});
