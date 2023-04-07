import { BatchedMigration } from '../batched-migration';

export default class TestMigration1 extends BatchedMigration {
  async getParameters() {
    return {
      min: 1n,
      max: 100n,
      batchSize: 10,
    };
  }

  async execute(min: bigint, max: bigint) {
    // TODO: do something testable?
    console.log(min, max);
  }
}
