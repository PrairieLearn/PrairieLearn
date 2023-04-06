import EventEmitter from 'node:events';
import { setTimeout } from 'node:timers/promises';
import {
  loadSqlEquiv,
  queryAsync,
  queryValidatedRows,
  queryValidatedZeroOrOneRow,
} from '@prairielearn/postgres';
import { doWithLock, tryWithLock } from '@prairielearn/named-locks';
import { BatchedMigrationSchema, BatchedMigrationType } from './schemas';
import { readAndValidateMigrationsFromDirectories } from '../load-migrations';
import path from 'node:path';
import { BatchedMigration } from './batched-migration';

const sql = loadSqlEquiv(__filename);

interface BatchedMigrationRunnerOptions {
  project: string;
  directories: string[];
  runDurationMs?: number;
}

export class BatchedMigrationsRunner extends EventEmitter {
  private readonly options: BatchedMigrationRunnerOptions;
  private running: boolean = false;
  private readonly lockName: string;

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

      const migrationFiles = await readAndValidateMigrationsFromDirectories(
        this.options.directories,
        ['.js', '.ts', '.mjs', '.mts']
      );

      const existingMigrationTimestamps = new Set(existingMigrations.map((m) => m.timestamp));
      for (const migrationFile of migrationFiles) {
        if (existingMigrationTimestamps.has(migrationFile.timestamp)) continue;

        // Load the migration file; we need this to get the batch size, min value, and max value.
        // In the future we'll have to handle ESM here...
        const migrationModulePath = path.join(migrationFile.directory, migrationFile.filename);
        const migrationModule = await import(migrationModulePath);
        console.log(migrationModule);

        const MigrationClass = migrationModule.default as new () => BatchedMigration;
        if (!MigrationClass || !(MigrationClass.prototype instanceof BatchedMigration)) {
          throw new Error(`Invalid migration class in ${migrationModulePath}`);
        }

        const migration = new MigrationClass();
        const migrationConfig = await migration.getConfig();

        await queryAsync(sql.insert_batched_migration, {
          project: this.options.project,
          name: migrationFile.filename,
          timestamp: migrationFile.timestamp,
          batch_size: migrationConfig.batchSize,
          min_value: migrationConfig.min,
          max_value: migrationConfig.max,
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
    // Select the earliest migration that is running.
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

  async performWork(): Promise<boolean> {
    const res = await tryWithLock(this.lockName, async () => {
      const migration = this.getOrStartMigration();
      if (!migration) {
        // No work to do. Handle this case.
      }
    });
    return !!res;
  }

  stop() {
    this.running = false;
  }
}
