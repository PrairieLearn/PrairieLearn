import EventEmitter from 'node:events';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import {
  loadSqlEquiv,
  queryAsync,
  queryValidatedOneRow,
  queryValidatedRows,
  queryValidatedZeroOrOneRow,
} from '@prairielearn/postgres';
import { doWithLock, tryWithLock } from '@prairielearn/named-locks';
import { z } from 'zod';

import {
  BatchedMigrationJobSchema,
  BatchedMigrationJobType,
  BatchedMigrationSchema,
  BatchedMigrationStatus,
  BatchedMigrationType,
} from './schemas';
import { MigrationFile, readAndValidateMigrationsFromDirectories } from '../load-migrations';
import { BatchedMigration } from './batched-migration';

const sql = loadSqlEquiv(__filename);

interface BatchedMigrationRunnerOptions {
  project: string;
  directories: string[];
  runDurationMs?: number;
}

export class BatchedMigrationsRunner extends EventEmitter {
  private readonly options: BatchedMigrationRunnerOptions;
  private readonly lockName: string;
  private running: boolean = false;
  private migrationFiles: MigrationFile[] = [];

  constructor(options: BatchedMigrationRunnerOptions) {
    super();
    this.options = options;
    this.lockName = `batched-migrations:${this.options.project}`;
  }

  async allBatchedMigrations() {
    return queryValidatedRows(
      sql.select_all_batched_migrations,
      { project: this.options.project },
      BatchedMigrationSchema
    );
  }

  async init() {
    await doWithLock(this.lockName, {}, async () => {
      const existingMigrations = await this.allBatchedMigrations();

      this.migrationFiles = await readAndValidateMigrationsFromDirectories(
        this.options.directories,
        ['.js', '.ts', '.mjs', '.mts']
      );

      const existingMigrationTimestamps = new Set(existingMigrations.map((m) => m.timestamp));
      for (const migrationFile of this.migrationFiles) {
        if (existingMigrationTimestamps.has(migrationFile.timestamp)) continue;

        const MigrationClass = await this.loadMigrationClass(migrationFile.timestamp);
        const migration = new MigrationClass();
        const migrationParameters = await migration.getParameters();

        await queryAsync(sql.insert_batched_migration, {
          project: this.options.project,
          name: migrationFile.filename,
          timestamp: migrationFile.timestamp,
          batch_size: migrationParameters.batchSize,
          min_value: migrationParameters.min,
          max_value: migrationParameters.max,
        });
      }
    });
  }

  start() {
    if (this.running) return;

    this.running = true;

    this.loop();
  }

  async loop() {
    while (true) {
      if (!this.running) return;

      try {
        await this.performWork();
      } catch (err) {
        this.emit('error', err);
      }

      await setTimeout(1000, null, { ref: false });
    }
  }

  /**
   * Loads that class for the given migration that's uniquely identified by its
   * timestamp. Timestamps are enforced to be unique by the database.
   */
  async loadMigrationClass(timestamp: string): Promise<new () => BatchedMigration> {
    const migrationFile = this.migrationFiles.find((m) => m.timestamp === timestamp);
    if (!migrationFile) throw new Error(`No migration found with timestamp ${timestamp}`);

    // Load the migration file; we need this to get the batch size, min value, and max value.
    // We use dynamic imports to handle both CJS and ESM modules.
    const migrationModulePath = path.join(migrationFile.directory, migrationFile.filename);
    const migrationModule = await import(migrationModulePath);
    console.log(migrationModule);

    const MigrationClass = migrationModule.default as new () => BatchedMigration;
    if (!MigrationClass || !(MigrationClass.prototype instanceof BatchedMigration)) {
      throw new Error(`Invalid migration class in ${migrationModulePath}`);
    }
    return MigrationClass;
  }

  /**
   * Should be called with the batched migrations lock held.
   */
  private async getOrStartMigration(): Promise<BatchedMigrationType | null> {
    return queryValidatedZeroOrOneRow(
      sql.select_running_migration,
      { project: this.options.project },
      BatchedMigrationSchema
    );
  }

  private async hasIncompleteJobs(migration: BatchedMigrationType) {
    const res = await queryValidatedOneRow(
      sql.batched_migration_has_incomplete_jobs,
      { batched_migration_id: migration.id },
      z.object({ exists: z.boolean() })
    );
    return res.exists;
  }

  private async hasFailedJobs(migration: BatchedMigrationType) {
    const res = await queryValidatedOneRow(
      sql.batched_migration_has_failed_jobs,
      { batched_migration_id: migration.id },
      z.object({ exists: z.boolean() })
    );
    return res.exists;
  }

  private async updateMigrationStatus(
    migration: BatchedMigrationType,
    status: BatchedMigrationStatus
  ) {
    await queryAsync(sql.update_batched_migration_status, {
      batched_migration_id: migration.id,
      status,
    });
  }

  private async finishRunningMigration(migration: BatchedMigrationType) {
    // Safety check: if there are any pending or running jobs, don't mark this
    // migration as finished.
    if (await this.hasIncompleteJobs(migration)) return;

    const hasFailedJobs = await this.hasFailedJobs(migration);
    const finalStatus = hasFailedJobs ? 'failed' : 'finished';
    await this.updateMigrationStatus(migration, finalStatus);
  }

  private async getOrCreateNextMigrationJob(
    migration: BatchedMigrationType
  ): Promise<BatchedMigrationJobType | null> {
    const nextBatchBounds = await this.getNextBatchBounds(migration);
    if (nextBatchBounds) {
      return queryValidatedOneRow(
        sql.insert_batched_migration_job,
        {
          batched_migration_id: migration.id,
          min_value: nextBatchBounds[0],
          max_value: nextBatchBounds[1],
        },
        BatchedMigrationJobSchema
      );
    } else {
      // Pick up any old pending jobs from this migration. These will only exist if
      // an admin manually elected to retry all failed jobs; we'll never automatically
      // transition failed jobs back to pending.
      return queryValidatedZeroOrOneRow(
        sql.select_first_pending_batched_migration_job,
        { batched_migration_id: migration.id },
        BatchedMigrationJobSchema
      );
    }
  }

  private async getNextBatchBounds(
    migration: BatchedMigrationType
  ): Promise<null | [BigInt, BigInt]> {
    const lastJob = await queryValidatedZeroOrOneRow(
      sql.select_last_batched_migration_job,
      {
        batched_migration_id: migration.id,
      },
      BatchedMigrationJobSchema
    );

    const nextMin = lastJob ? lastJob.max_value + 1n : migration.min_value;
    if (nextMin > migration.max_value) return null;

    let nextMax = nextMin + BigInt(migration.batch_size) - 1n;
    if (nextMax > migration.max_value) nextMax = migration.max_value;

    return [nextMin, nextMax];
  }

  private async runMigrationJob(migration: BatchedMigrationType) {
    const nextJob = await this.getOrCreateNextMigrationJob(migration);
    if (nextJob) {
      try {
      } catch (err) {}
    } else {
      await this.finishRunningMigration(migration);
    }
  }

  async performWork(): Promise<boolean> {
    let didWork = false;
    await tryWithLock(this.lockName, async () => {
      didWork = true;
      const migration = await this.getOrStartMigration();
      if (!migration) {
        // No work to do. Handle this case.
        return;
      }
      // TODO: should actually loop here with the lock held.
      await this.runMigrationJob(migration);
    });
    return didWork;
  }

  stop() {
    this.running = false;
  }
}
