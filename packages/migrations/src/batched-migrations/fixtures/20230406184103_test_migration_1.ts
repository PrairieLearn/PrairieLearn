import { BatchedMigration } from '../batched-migration';

class TestMigration1 extends BatchedMigration {
  async getConfig() {
    return {
      min: 1n,
      max: 100n,
      batchSize: 10,
    };
  }

  async execute(min: BigInt, max: BigInt) {
    // TODO: do something testable?
    console.log(min, max);
  }
}

module.exports = TestMigration1;
