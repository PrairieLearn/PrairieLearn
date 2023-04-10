import { BatchedMigration } from '../batched-migration';

export default class TestMigration1 extends BatchedMigration {
  async getParameters() {
    return {
      min: 1n,
      max: 100n,
      batchSize: 10,
    };
  }

  async execute(_min: bigint, _max: bigint) {}
}
