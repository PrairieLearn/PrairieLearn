import { loadSqlEquiv, queryAsync, queryRow, queryOptionalRow } from '@prairielearn/postgres';
import { logger } from '@prairielearn/logger';
import { serializeError } from 'serialize-error';
import { z } from 'zod';

import {
  BatchedMigrationStatus,
  BatchedMigrationRow,
  updateBatchedMigrationStatus,
  BatchedMigrationStatusSchema,
  BatchedMigrationImplementation,
} from './batched-migration';
import {
  BatchedMigrationJobRowSchema,
  BatchedMigrationJobStatus,
  BatchedMigrationJobRow,
} from './batched-migration-job';

const sql = loadSqlEquiv(__filename);

interface BatchedMigrationRunnerOptions {
  logProgress?: boolean;
}

export class BatchedMigrationRunner {
  private options: BatchedMigrationRunnerOptions;
  private migration: BatchedMigrationRow;
  private migrationImplementation: BatchedMigrationImplementation;
  private migrationStatus: BatchedMigrationStatus;

  constructor(
    migration: BatchedMigrationRow,
    migrationImplementation: BatchedMigrationImplementation,
    options: BatchedMigrationRunnerOptions = {},
  ) {
    this.options = options;
    this.migration = migration;
    this.migrationImplementation = migrationImplementation;
    this.migrationStatus = migration.status;
  }

  private log(message: string, ...meta: any[]) {
    if (this.options.logProgress) {
      logger.info(`[${this.migration.filename}] ${message}`, ...meta);
    }
  }

  private async hasIncompleteJobs(migration: BatchedMigrationRow): Promise<boolean> {
    return await queryRow(
      sql.batched_migration_has_incomplete_jobs,
      { batched_migration_id: migration.id },
      z.boolean(),
    );
  }

  private async hasFailedJobs(migration: BatchedMigrationRow): Promise<boolean> {
    return await queryRow(
      sql.batched_migration_has_failed_jobs,
      { batched_migration_id: migration.id },
      z.boolean(),
    );
  }

  private async refreshMigrationStatus(migration: BatchedMigrationRow) {
    this.migrationStatus = await queryRow(
      sql.get_migration_status,
      {
        id: migration.id,
      },
      BatchedMigrationStatusSchema,
    );
  }

  private async finishRunningMigration(migration: BatchedMigrationRow) {
    // Safety check: if there are any pending jobs, don't mark this
    // migration as finished.
    if (await this.hasIncompleteJobs(migration)) {
      this.log(`Incomplete jobs found, not marking as finished`);
      return;
    }

    const hasFailedJobs = await this.hasFailedJobs(migration);
    const finalStatus = hasFailedJobs ? 'failed' : 'succeeded';
    await updateBatchedMigrationStatus(migration.id, finalStatus);
    this.log(`Finished with status '${finalStatus}'`);
  }

  private async getNextBatchBounds(
    migration: BatchedMigrationRow,
  ): Promise<null | [bigint, bigint]> {
    const lastJob = await queryOptionalRow(
      sql.select_last_batched_migration_job,
      { batched_migration_id: migration.id },
      BatchedMigrationJobRowSchema,
    );

    const nextMin = lastJob ? lastJob.max_value + 1n : migration.min_value;
    if (nextMin > migration.max_value) return null;

    let nextMax = nextMin + BigInt(migration.batch_size) - 1n;
    if (nextMax > migration.max_value) nextMax = migration.max_value;

    return [nextMin, nextMax];
  }

  private async startJob(job: BatchedMigrationJobRow) {
    await queryAsync(sql.start_batched_migration_job, { id: job.id });
    const jobRange = `[${job.min_value}, ${job.max_value}]`;
    const migrationRange = `[${this.migration.min_value}, ${this.migration.max_value}]`;
    this.log(`Started job ${job.id} for range ${jobRange} in ${migrationRange}`);
  }

  private serializeJobData(data: unknown) {
    if (data == null) return null;

    // Return JSON-stringified data. Convert BigInts to strings.
    return JSON.stringify(data, (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      return value;
    });
  }

  private async finishJob(
    job: BatchedMigrationJobRow,
    status: Extract<BatchedMigrationJobStatus, 'failed' | 'succeeded'>,
    data?: unknown,
  ) {
    await queryAsync(sql.finish_batched_migration_job, {
      id: job.id,
      status,
      data: this.serializeJobData(data),
    });
    this.log(`Job ${job.id} finished with status '${status}'`);
  }

  private async getOrCreateNextMigrationJob(
    migration: BatchedMigrationRow,
  ): Promise<BatchedMigrationJobRow | null> {
    const nextBatchBounds = await this.getNextBatchBounds(migration);
    if (nextBatchBounds) {
      return await queryRow(
        sql.insert_batched_migration_job,
        {
          batched_migration_id: migration.id,
          min_value: nextBatchBounds[0],
          max_value: nextBatchBounds[1],
        },
        BatchedMigrationJobRowSchema,
      );
    } else {
      // Pick up any old pending jobs from this migration. These will only exist if
      // an admin manually elected to retry all failed jobs; we'll never automatically
      // transition failed jobs back to pending.
      return await queryOptionalRow(
        sql.select_first_pending_batched_migration_job,
        { batched_migration_id: migration.id },
        BatchedMigrationJobRowSchema,
      );
    }
  }

  private async runMigrationJob(
    migration: BatchedMigrationRow,
    migrationImplementation: BatchedMigrationImplementation,
  ) {
    const nextJob = await this.getOrCreateNextMigrationJob(migration);
    if (nextJob) {
      await this.startJob(nextJob);

      let error = null;
      try {
        // We'll only handle errors thrown by the migration itself. If any of
        // our own execution machinery throws an error, we'll let it bubble up.
        await migrationImplementation.execute(nextJob.min_value, nextJob.max_value);
      } catch (err) {
        error = err;
      }

      if (error) {
        logger.error(
          `Error running job ${nextJob.id} for batched migration ${migration.filename}`,
          error,
        );
        await this.finishJob(nextJob, 'failed', { error: serializeError(error) });
      } else {
        await this.finishJob(nextJob, 'succeeded');
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
    const endTime = durationMs ? Date.now() + durationMs : null;
    while (
      !signal?.aborted &&
      (iterations ? iterationCount < iterations : true) &&
      (endTime ? Date.now() < endTime : true) &&
      (this.migrationStatus === 'running' || this.migrationStatus === 'finalizing')
    ) {
      await this.runMigrationJob(this.migration, this.migrationImplementation);
      iterationCount += 1;
      // Always refresh the status so we can detect if the migration was marked
      // as paused by another process.
      await this.refreshMigrationStatus(this.migration);
    }
  }
}
