import z from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, queryRow } from '@prairielearn/postgres';

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryRow(
      'SELECT MAX(id) as max from variants;',
      z.bigint({ coerce: true }).nullable(),
    );
    return {
      min: 1n,
      max,
      batchSize: 1000,
    };
  },

  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(
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
