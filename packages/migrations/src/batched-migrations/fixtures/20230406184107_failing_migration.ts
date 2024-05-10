import { makeBatchedMigration } from '../batched-migration.js';

export default makeBatchedMigration({
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
