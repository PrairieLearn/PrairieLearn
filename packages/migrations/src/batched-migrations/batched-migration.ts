export interface BatchedMigrationParameters {
  min: BigInt;
  max: BigInt;
  batchSize: number;
}

/**
 * A batched migration operates on a range of IDs in batches. It's designed
 * for migrations that are too large to run in a single transaction.
 *
 * Migrations should be idempotent, as they may be run multiple times in case
 * of unexpected failure.
 */
export abstract class BatchedMigration {
  public abstract getParameters(): Promise<BatchedMigrationParameters>;
  public abstract execute(start: BigInt, end: BigInt): Promise<void>;
}
