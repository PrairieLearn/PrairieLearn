import { BatchedMigration } from '../batched-migration';

export default class TestMigrationNoRows extends BatchedMigration {
  async getParameters() {
    return {
      // Simulates the case where there are no rows to process. A null
      // max value is what we would get for some query like
      // `SELECT MAX(id) FROM table;`.
      max: null,
      batchSize: 10,
    };
  }

  async execute(min: bigint, max: bigint) {
    // TODO: something testable?
    console.log(min, max);
  }
}
