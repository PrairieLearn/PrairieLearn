/**
 * A batched migration operates on a range of IDs in batches. It's designed
 * for migrations that are too large to run in a single transaction.
 *
 * Migrations should be idempotent, as they may be run multiple times in case
 * of unexpected failure.
 */
export abstract class BatchedMigration {
  public async getMin(): Promise<string> {
    return '0';
  }
  public abstract getMax(): Promise<string>;
  public abstract execute(start: BigInt, end: BigInt): Promise<void>;
}
