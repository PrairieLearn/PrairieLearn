// @ts-check
const { BatchedMigration } = require('../batched-migration');

class TestMigration2 extends BatchedMigration {
  async getParameters() {
    return {
      min: 2n,
      max: 200n,
      batchSize: 20,
    };
  }

  async execute(_min, _max) {
    throw new Error('Testing failure');
  }
}

module.exports = TestMigration2;
