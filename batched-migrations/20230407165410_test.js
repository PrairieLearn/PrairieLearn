// @ts-check
const { BatchedMigration } = require('@prairielearn/migrations');
const { setTimeout } = require('node:timers/promises');

// TODO: delete before merging
class TestBatchedMigration extends BatchedMigration {
  async getParameters() {
    return {
      min: 1n,
      max: 100000n,
      batchSize: 1000,
    };
  }

  /**
   * @param {bigint} min
   * @param {bigint} max
   */
  async execute(min, max) {
    console.log(`Running for range [${min}, ${max}]`);
    // throw new Error('Testing failure');
    await setTimeout(1000);
  }
}

module.exports = TestBatchedMigration;
