import {
  loadSqlEquiv,
  queryAsync,
  queryValidatedOneRow,
  queryValidatedZeroOrOneRow,
} from '@prairielearn/postgres';
import { z } from 'zod';

import {
  BatchedMigration,
  BatchedMigrationStatus,
  BatchedMigrationRow,
  updateBatchedMigrationStatus,
} from './batched-migration';
import {
  BatchedMigrationJobRowSchema,
  BatchedMigrationJobStatus,
  BatchedMigrationJobRow,
} from './batched-migration-job';

const sql = loadSqlEquiv(__filename);

export class BatchedMigrationRunner {
  private migration: BatchedMigrationRow;
  private migrationImplementation: BatchedMigration;
  private migrationStatus: BatchedMigrationStatus;

  constructor(migration: BatchedMigrationRow, migrationImplementation: BatchedMigration) {
    this.migration = migration;
    this.migrationImplementation = migrationImplementation;
    this.migrationStatus = migration.status;
  }

  private async hasIncompleteJobs(migration: BatchedMigrationRow) {
    const res = await queryValidatedOneRow(
      sql.batched_migration_has_incomplete_jobs,
      { batched_migration_id: migration.id },
      z.object({ exists: z.boolean() })
    );
    return res.exists;
  }

  private async hasFailedJobs(migration: BatchedMigrationRow) {
    const res = await queryValidatedOneRow(
      sql.batched_migration_has_failed_jobs,
      { batched_migration_id: migration.id },
      z.object({ exists: z.boolean() })
    );
    return res.exists;
  }

  private async updateMigrationStatus(
    migration: BatchedMigrationRow,
    status: BatchedMigrationStatus
  ) {
    await updateBatchedMigrationStatus(migration.id, status);
    this.migrationStatus = status;
  }

  private async finishRunningMigration(migration: BatchedMigrationRow) {
    // Safety check: if there are any pending jobs, don't mark this
    // migration as finished.
    if (await this.hasIncompleteJobs(migration)) return;

    const hasFailedJobs = await this.hasFailedJobs(migration);
    const finalStatus = hasFailedJobs ? 'failed' : 'succeeded';
    await this.updateMigrationStatus(migration, finalStatus);
  }

  private async getNextBatchBounds(
    migration: BatchedMigrationRow
  ): Promise<null | [bigint, bigint]> {
    const lastJob = await queryValidatedZeroOrOneRow(
      sql.select_last_batched_migration_job,
      { batched_migration_id: migration.id },
      BatchedMigrationJobRowSchema
    );

    const nextMin = lastJob ? lastJob.max_value + 1n : migration.min_value;
    if (nextMin > migration.max_value) return null;

    let nextMax = nextMin + BigInt(migration.batch_size) - 1n;
    if (nextMax > migration.max_value) nextMax = migration.max_value;

    return [nextMin, nextMax];
  }

  private async startJob(job: BatchedMigrationJobRow) {
    await queryAsync(sql.start_batched_migration_job, { id: job.id });
  }

  private async finishJob(
    job: BatchedMigrationJobRow,
    status: Extract<BatchedMigrationJobStatus, 'failed' | 'succeeded'>
  ) {
    await queryAsync(sql.finish_batched_migration_job, { id: job.id, status });
  }

  private async getOrCreateNextMigrationJob(
    migration: BatchedMigrationRow
  ): Promise<BatchedMigrationJobRow | null> {
    const nextBatchBounds = await this.getNextBatchBounds(migration);
    if (nextBatchBounds) {
      return queryValidatedOneRow(
        sql.insert_batched_migration_job,
        {
          batched_migration_id: migration.id,
          min_value: nextBatchBounds[0],
          max_value: nextBatchBounds[1],
        },
        BatchedMigrationJobRowSchema
      );
    } else {
      // Pick up any old pending jobs from this migration. These will only exist if
      // an admin manually elected to retry all failed jobs; we'll never automatically
      // transition failed jobs back to pending.
      return queryValidatedZeroOrOneRow(
        sql.select_first_pending_batched_migration_job,
        { batched_migration_id: migration.id },
        BatchedMigrationJobRowSchema
      );
    }
  }

  private async runMigrationJob(
    migration: BatchedMigrationRow,
    migrationInstance: BatchedMigration
  ) {
    const nextJob = await this.getOrCreateNextMigrationJob(migration);
    if (nextJob) {
      try {
        await this.startJob(nextJob);
        await migrationInstance.execute(nextJob.min_value, nextJob.max_value);
        await this.finishJob(nextJob, 'succeeded');
      } catch (err) {
        await this.finishJob(nextJob, 'failed');
      }
    } else {
      await this.finishRunningMigration(migration);
    }
  }

  async run({
    signal,
    iterations,
    durationMs,
  }: { signal?: AbortSignal; iterations?: number; durationMs?: number } = {}) {
    let iterationCount = 0;
    let endTime = durationMs ? Date.now() + durationMs : null;
    while (
      !signal?.aborted &&
      (iterations ? iterationCount < iterations : true) &&
      (endTime ? Date.now() < endTime : true) &&
      this.migrationStatus === 'running'
    ) {
      await this.runMigrationJob(this.migration, this.migrationImplementation);
      iterationCount += 1;
    }
  }
}
