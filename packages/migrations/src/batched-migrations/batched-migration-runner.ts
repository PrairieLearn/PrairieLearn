import {
  queryAsync,
  queryValidatedOneRow,
  queryValidatedZeroOrOneRow,
} from '@prairielearn/postgres';
import { z } from 'zod';

import { BatchedMigration } from './batched-migration';

const BatchedMigrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  min: z.bigint({ coerce: true }),
  max: z.bigint({ coerce: true }),
  current: z.bigint({ coerce: true }),
});
type BatchedMigrationRow = z.infer<typeof BatchedMigrationSchema>;

export class BatchedMigrationRunner {
  private name: string;
  private migration: BatchedMigration;

  constructor(name: string, migration: BatchedMigration) {
    this.name = name;
    this.migration = migration;
  }

  private async getMigrationState(): Promise<BatchedMigrationRow> {
    const migration = await queryValidatedZeroOrOneRow(
      'SELECT * FROM batched_migrations WHERE name = $name;',
      { name: this.name },
      BatchedMigrationSchema
    );
    if (migration) return migration;

    return this.createMigrationState();
  }

  private async createMigrationState(): Promise<BatchedMigrationRow> {
    const min = await this.migration.getMin();
    const max = await this.migration.getMax();
    return await queryValidatedOneRow(
      'INSERT INTO batched_migrations (name, min, max, current) VALUES ($name, $min, $max, $min) ON CONFLICT DO NOTHING RETURNING *;',
      { name: this.name, min, max },
      BatchedMigrationSchema
    );
  }

  private async updateMigrationState(current: BigInt): Promise<void> {
    await queryAsync('UPDATE batched_migrations SET current = $current WHERE name = $name;', {
      name: this.name,
      current,
    });
  }

  /**
   * Should be used when the migration is being run with a short-lived lock
   * held. Allows the migration to be picked up by different machines and
   * be automatically restarted in case of failure.
   *
   * @param duration How many seconds to execute for.
   */
  async runForDuration(duration: number): Promise<void> {
    await this.run({ signal: AbortSignal.timeout(duration * 1000) });
  }

  async run({
    signal,
    iterations,
  }: { signal?: AbortSignal; iterations?: number } = {}): Promise<void> {
    const migrationState = await this.getMigrationState();

    let current = migrationState.current;
    let iterationCount = 0;
    while (
      !signal?.aborted &&
      (iterations ? iterationCount < iterations : true) &&
      current < migrationState.max
    ) {
      // TODO: configurable batch size
      let max = current + 1000n;
      if (max > migrationState.max) max = migrationState.max;

      this.migration.execute(current, max);

      current = max;
      await this.updateMigrationState(current);
      iterationCount += 1;
    }
  }
}
