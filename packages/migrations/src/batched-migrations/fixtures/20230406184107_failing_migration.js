// @ts-check
const { makeBatchedMigration } = require('../batched-migration');

module.exports = makeBatchedMigration({
  async getParameters() {
    return {
      min: 2n,
      max: 200n,
      batchSize: 20,
    };
  },

  async execute(_min, _max) {
    throw new Error('Testing failure');
  },
});
