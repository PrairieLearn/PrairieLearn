// @ts-check
const { BatchedMigration } = require('@prairielearn/migrations');
const { setTimeout } = require('node:timers/promises');

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
    await setTimeout(10000);
  }
}

module.exports = TestBatchedMigration;
