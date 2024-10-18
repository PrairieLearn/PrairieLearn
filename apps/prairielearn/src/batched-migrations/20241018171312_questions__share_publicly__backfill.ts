import { makeBatchedMigration } from '@prairielearn/migrations';
import { queryOneRowAsync, queryAsync } from '@prairielearn/postgres';

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from questions;', {});
    return {
      min: 1n,
      max: result.rows[0].max,
      batchSize: 1000,
    };
  },

  async execute(start: bigint, end: bigint): Promise<void> {
    await queryAsync(
      `
      UPDATE questions AS q
      SET
        share_publicly = q.shared_publicly
      FROM
        questions AS q
      WHERE
        v.id >= $start AND
        v.id <= $end`,
      { start, end },
    );
  },
});
