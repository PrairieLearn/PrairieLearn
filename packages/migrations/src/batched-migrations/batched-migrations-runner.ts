import EventEmitter from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { loadSqlEquiv, queryZeroOrOneRowAsync } from '@prairielearn/postgres';
import { tryWithLock } from '@prairielearn/named-locks';

const sql = loadSqlEquiv(__filename);

interface BatchedMigrationRunnerOptions {
  project: string;
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
  private async getOrStartMigration() {
    const runningMigration = await queryZeroOrOneRowAsync(sql.select_running_migration, {
      project: this.options.project,
    });
  }

  async performWork(): Promise<boolean> {
    const res = await tryWithLock(this.lockName, async () => {
      // Select the earliest migration that is running.
    });
    return !!res;
  }

  stop() {
    this.running = false;
  }
}
