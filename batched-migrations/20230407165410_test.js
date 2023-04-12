// @ts-check
const { makeBatchedMigration } = require('@prairielearn/migrations');
const { setTimeout } = require('node:timers/promises');

// TODO: delete before merging
module.exports = makeBatchedMigration({
  async getParameters() {
    return {
      min: 1n,
      max: 100000n,
      batchSize: 1000,
    };
  },

  /**
   * @param {bigint} min
   * @param {bigint} max
   */
  async execute(min, max) {
    console.log(`Running for range [${min}, ${max}]`);
    await setTimeout(1000);
    // throw new Error('Testing failure');
  },
});
