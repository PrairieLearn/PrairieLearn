import EventEmitter from 'node:events';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadSqlEquiv, queryValidatedZeroOrOneRow } from '@prairielearn/postgres';
import { doWithLock, tryWithLock } from '@prairielearn/named-locks';

import { MigrationFile, readAndValidateMigrationsFromDirectories } from '../load-migrations';
import {
  BatchedMigration,
  BatchedMigrationRowSchema,
  BatchedMigrationRow,
  insertBatchedMigration,
  selectAllBatchedMigrations,
} from './batched-migration';
import { BatchedMigrationRunner } from './batched-migration-runner';

const sql = loadSqlEquiv(__filename);

interface BatchedMigrationRunnerOptions {
  project: string;
  directories: string[];
  runDurationMs?: number;
}

export class BatchedMigrationsRunner extends EventEmitter {
  private readonly options: BatchedMigrationRunnerOptions;
  private readonly lockName: string;
  private started: boolean = false;
  private migrationFiles: MigrationFile[] = [];
  private abortController = new AbortController();

  constructor(options: BatchedMigrationRunnerOptions) {
    super();
    this.options = options;
    this.lockName = `batched-migrations:${this.options.project}`;
  }

  async init() {
    await doWithLock(this.lockName, {}, async () => {
      const existingMigrations = await selectAllBatchedMigrations(this.options.project);

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

        await insertBatchedMigration({
          project: this.options.project,
          filename: migrationFile.filename,
          timestamp: migrationFile.timestamp,
          batch_size: migrationParameters.batchSize,
          min_value: migrationParameters.min,
          max_value: migrationParameters.max,
        });
      }
    });
  }

  start() {
    if (this.started) {
      throw new Error('BatchedMigrationsRunner was already started');
    }

    this.started = true;
    this.loop();
  }

  async loop() {
    while (true) {
      if (this.abortController.signal.aborted) return;

      let didWork = false;
      try {
        await tryWithLock(this.lockName, async () => {
          didWork = await this.performWork(60 * 1000);
        });
      } catch (err) {
        this.emit('error', err);
      }

      const waitInterval = didWork ? 1_000 : 30_000;
      await sleep(waitInterval, null, { ref: false });
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

    const MigrationClass = migrationModule.default as new () => BatchedMigration;
    if (!MigrationClass || !(MigrationClass.prototype instanceof BatchedMigration)) {
      throw new Error(`Invalid migration class in ${migrationModulePath}`);
    }
    return MigrationClass;
  }

  /**
   * Should be called with the batched migrations lock held.
   */
  private async getOrStartMigration(): Promise<BatchedMigrationRow | null> {
    // TODO: should this actually transition a migration from pending to running?
    // If so, implement that here.
    return queryValidatedZeroOrOneRow(
      sql.select_running_migration,
      { project: this.options.project },
      BatchedMigrationRowSchema
    );
  }

  async performWork(durationMs: number): Promise<boolean> {
    const migration = await this.getOrStartMigration();
    if (!migration) {
      // No work to do. Handle this case.
      return false;
    }

    const MigrationClass = await this.loadMigrationClass(migration.timestamp);
    const migrationInstance = new MigrationClass();

    const runner = new BatchedMigrationRunner(migration, migrationInstance);
    await runner.run({ signal: this.abortController.signal, durationMs });

    return true;
  }

  stop() {
    this.abortController.abort();
  }
}

let runner: BatchedMigrationsRunner | null = null;

export async function initBatchedMigrations(options: BatchedMigrationRunnerOptions) {
  if (runner) throw new Error('Batched migrations already initialized');
  runner = new BatchedMigrationsRunner(options);
  await runner.init();
  runner.start();
}

export function stopBatchedMigrations() {
  runner?.stop();
  runner = null;
}
