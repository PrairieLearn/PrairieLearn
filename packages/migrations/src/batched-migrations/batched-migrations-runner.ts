import EventEmitter from 'node:events';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { doWithLock } from '@prairielearn/named-locks';

import { MigrationFile, readAndValidateMigrationsFromDirectories } from '../load-migrations';
import {
  BatchedMigrationRowSchema,
  BatchedMigrationRow,
  insertBatchedMigration,
  BatchedMigrationStatus,
  selectBatchedMigrationForTimestamp,
  updateBatchedMigrationStatus,
  BatchedMigrationImplementation,
  validateBatchedMigrationImplementation,
} from './batched-migration';
import { BatchedMigrationRunner } from './batched-migration-runner';

const sql = loadSqlEquiv(__filename);

const DEFAULT_MIN_VALUE = 1n;
const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_WORK_DURATION_MS = 60_000;
const DEFAULT_SLEEP_DURATION_MS = 30_000;
const EXTENSIONS = ['.js', '.ts', '.mjs', '.mts'];

interface BatchedMigrationRunnerOptions {
  project: string;
  directories: string[];
}

interface BatchedMigrationStartOptions {
  workDurationMs?: number;
  sleepDurationMs?: number;
}

interface BatchedMigrationFinalizeOptions {
  logProgress?: boolean;
}

export class BatchedMigrationsRunner extends EventEmitter {
  private readonly options: BatchedMigrationRunnerOptions;
  private readonly lockName: string;
  private running = false;
  private migrationFiles: MigrationFile[] | null = null;
  private abortController = new AbortController();

  constructor(options: BatchedMigrationRunnerOptions) {
    super();
    this.options = options;
    this.lockName = `batched-migrations:${this.options.project}`;
  }

  private lockNameForTimestamp(timestamp: string) {
    return `${this.lockName}:${timestamp}`;
  }

  private getMigrationFiles = async () => {
    if (!this.migrationFiles) {
      this.migrationFiles = await readAndValidateMigrationsFromDirectories(
        this.options.directories,
        EXTENSIONS,
      );
    }
    return this.migrationFiles;
  };

  private async getMigrationForIdentifier(identifier: string): Promise<MigrationFile | null> {
    const timestamp = identifier.split('_')[0];

    const migrationFiles = await this.getMigrationFiles();
    const migrationFile = migrationFiles.find((m) => m.timestamp === timestamp);
    return migrationFile ?? null;
  }

  /**
   * Loads the implementation for the migration with the given identifier. The identifier
   * must start with a 14-character timestamp. It may optionally be followed by
   * an underscore with additional characters, which are ignored. These should
   * typically be used to provide a human-readable name for the migration.
   */
  private async loadMigrationImplementation(migrationFile: MigrationFile) {
    // We use dynamic imports to handle both CJS and ESM modules.
    const migrationModulePath = path.join(migrationFile.directory, migrationFile.filename);
    const migrationModule = await import(migrationModulePath);

    const migrationImplementation = migrationModule.default as BatchedMigrationImplementation;
    validateBatchedMigrationImplementation(migrationImplementation);
    return migrationImplementation;
  }

  async enqueueBatchedMigration(identifier: string) {
    const migrationFile = await this.getMigrationForIdentifier(identifier);
    if (!migrationFile) {
      throw new Error(`No migration found for identifier ${identifier}`);
    }

    const migrationImplementation = await this.loadMigrationImplementation(migrationFile);
    const migrationParameters = await migrationImplementation.getParameters();

    // If `max` is null, that implies that there are no rows to process, so
    // we can immediately mark the migration as finished.
    const status: BatchedMigrationStatus =
      migrationParameters.max === null ? 'succeeded' : 'pending';

    const minValue = BigInt(migrationParameters.min ?? DEFAULT_MIN_VALUE);
    const maxValue = BigInt(migrationParameters.max ?? minValue);
    const batchSize = migrationParameters.batchSize ?? DEFAULT_BATCH_SIZE;

    await insertBatchedMigration({
      project: this.options.project,
      filename: migrationFile.filename,
      timestamp: migrationFile.timestamp,
      batch_size: batchSize,
      min_value: minValue,
      max_value: maxValue,
      status,
    });
  }

  async finalizeBatchedMigration(identifier: string, options?: BatchedMigrationFinalizeOptions) {
    const timestamp = identifier.split('_')[0];

    let migration = await selectBatchedMigrationForTimestamp(this.options.project, timestamp);

    if (migration.status === 'succeeded') return;

    // If the migration isn't already in the finalizing state, mark it as such.
    if (migration.status !== 'finalizing') {
      migration = await updateBatchedMigrationStatus(migration.id, 'finalizing');
    }

    await doWithLock(this.lockNameForTimestamp(timestamp), { autoRenew: true }, async () => {
      const migrationFile = await this.getMigrationForIdentifier(identifier);
      if (!migrationFile) {
        throw new Error(`No migration found for identifier ${identifier}`);
      }
      const migrationImplementation = await this.loadMigrationImplementation(migrationFile);

      const runner = new BatchedMigrationRunner(migration, migrationImplementation, {
        // Always log progress unless explicitly disabled.
        logProgress: options?.logProgress ?? true,
      });

      // Because we don't give any arguments to `run()`, it will run until it
      // has attempted every job.
      await runner.run();
    });

    migration = await selectBatchedMigrationForTimestamp(this.options.project, timestamp);

    if (migration.status === 'succeeded') return;

    throw new Error(
      `Expected batched migration with identifier ${identifier} to be marked as 'succeeded', but it is '${migration.status}'.`,
    );
  }

  start(options: BatchedMigrationStartOptions = {}) {
    if (this.running) {
      throw new Error('BatchedMigrationsRunner is already running');
    }

    this.loop(options);
  }

  async loop({ workDurationMs, sleepDurationMs }: BatchedMigrationStartOptions) {
    workDurationMs ??= DEFAULT_WORK_DURATION_MS;
    sleepDurationMs ??= DEFAULT_SLEEP_DURATION_MS;

    this.running = true;
    while (this.running) {
      if (this.abortController.signal.aborted) {
        // We assign this here so that `stop()` can tell when this loop is done
        // processing jobs.
        this.running = false;
        return;
      }

      let didWork = false;
      try {
        didWork = await this.maybePerformWork(workDurationMs);
      } catch (err) {
        this.emit('error', err);
      }

      // If we did work, we'll immediately try again since there's probably more
      // work to be done. If not, we'll sleep for a while - maybe some more work
      // will become available!
      if (!didWork) {
        // We provide the signal here so that we can more quickly stop things
        // when we're shutting down.
        try {
          await sleep(sleepDurationMs, null, { ref: false, signal: this.abortController.signal });
        } catch (err) {
          // We don't care about errors here, they should only ever occur when
          // the AbortController is aborted. Continue to the next iteration of
          // the loop so we can shut down.
          continue;
        }
      }
    }
  }

  private async getOrStartMigration(): Promise<BatchedMigrationRow | null> {
    return doWithLock(
      this.lockName,
      {
        // Don't fail if the lock couldn't be acquired immediately.
        onNotAcquired: () => null,
      },
      async () => {
        let migration = await queryOptionalRow(
          sql.select_running_migration,
          { project: this.options.project },
          BatchedMigrationRowSchema,
        );

        if (!migration) {
          migration = await queryOptionalRow(
            sql.start_next_pending_migration,
            { project: this.options.project },
            BatchedMigrationRowSchema,
          );
        }

        return migration;
      },
    );
  }

  async maybePerformWork(durationMs: number): Promise<boolean> {
    const migration = await this.getOrStartMigration();
    if (!migration) {
      // No work to do. Handle this case.
      return false;
    }

    // This server may not yet know about the current running migration. If
    // that's the case, we'll just skip it for now.
    const migrationFile = await this.getMigrationForIdentifier(migration.timestamp);
    if (!migrationFile) {
      return false;
    }

    let didWork = false;
    await doWithLock(
      this.lockNameForTimestamp(migrationFile.timestamp),
      {
        autoRenew: true,
        // Do nothing if the lock could not immediately be acquired.
        onNotAcquired: () => null,
      },
      async () => {
        didWork = true;
        const migrationImplementation = await this.loadMigrationImplementation(migrationFile);

        const runner = new BatchedMigrationRunner(migration, migrationImplementation);

        try {
          await runner.run({ signal: this.abortController.signal, durationMs });
        } catch (err) {
          this.emit('error', err);
        }
      },
    );

    return didWork;
  }

  async stop() {
    this.abortController.abort();

    // Spin until we're no longer running.
    while (this.running) {
      await sleep(1000);
    }
  }
}

let runner: BatchedMigrationsRunner | null = null;

function assertRunner(
  runner: BatchedMigrationsRunner | null,
): asserts runner is BatchedMigrationsRunner {
  if (!runner) throw new Error('Batched migrations not initialized');
}

export function initBatchedMigrations(options: BatchedMigrationRunnerOptions) {
  if (runner) throw new Error('Batched migrations already initialized');
  runner = new BatchedMigrationsRunner(options);
  return runner;
}

export function startBatchedMigrations(options: BatchedMigrationStartOptions = {}) {
  assertRunner(runner);
  runner.start(options);
  return runner;
}

export async function stopBatchedMigrations() {
  assertRunner(runner);
  await runner.stop();
  runner = null;
}

/**
 * Given a batched migration identifier like `20230406184103_migration`,
 * enqueues it for execution by creating a row in the `batched_migrations`
 * table.
 *
 * Despite taking a full identifier, only the timestamp is used to uniquely
 * identify the batched migration. The remaining part is just used to make
 * calls more human-readable.
 *
 * @param identifier The identifier of the batched migration to enqueue.
 */
export async function enqueueBatchedMigration(identifier: string) {
  assertRunner(runner);
  await runner.enqueueBatchedMigration(identifier);
}

/**
 * Given a batched migration identifier like `20230406184103_migration`,
 * synchronously runs it to completion. An error will be thrown if the final
 * status of the migration is not `succeeded`.
 *
 * @param identifier The identifier of the batched migration to finalize.
 * @param options Options for finalizing the batched migration.
 */
export async function finalizeBatchedMigration(
  identifier: string,
  options?: BatchedMigrationFinalizeOptions,
) {
  assertRunner(runner);
  await runner.finalizeBatchedMigration(identifier, options);
}
