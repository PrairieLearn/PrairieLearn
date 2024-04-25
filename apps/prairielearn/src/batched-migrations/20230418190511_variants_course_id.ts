import { makeBatchedMigration } from '@prairielearn/migrations';
import { queryOneRowAsync, queryAsync } from '@prairielearn/postgres';

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from variants;', {});
    return {
      min: 1n,
      max: result.rows[0].max,
      batchSize: 1000,
    };
  },

  async execute(start: bigint, end: bigint): Promise<void> {
    await queryAsync(
      `
      UPDATE variants AS v
      SET
        course_id = q.course_id
      FROM
        questions AS q
      WHERE
        v.course_id IS NULL AND
        v.question_id = q.id AND
        v.id >= $start AND
        v.id <= $end`,
      { start, end },
    );
  },
});
