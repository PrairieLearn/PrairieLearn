import { makeBatchedMigration } from '../batched-migration';

export default makeBatchedMigration({
  async getParameters() {
    return {
      min: 1n,
      max: 100n,
      batchSize: 10,
    };
  },

  async execute(_min: bigint, _max: bigint) {},
});
