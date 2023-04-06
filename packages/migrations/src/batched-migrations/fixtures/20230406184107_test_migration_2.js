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

  async execute(min, max) {
    // TODO: do something testable?
    console.log(min, max);
  }
}

module.exports = TestMigration2;
