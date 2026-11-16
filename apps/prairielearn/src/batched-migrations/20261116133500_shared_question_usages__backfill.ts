import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

// Enqueue in a follow-up migration only after every server records submissions.
// Backfill can only use surviving submissions, provenance and group membership.
export default makeBatchedMigration({
  async getParameters() {
    const max = await queryScalar(sql.select_bounds, z.bigint({ coerce: true }).nullable());
    return { min: 1n, max, batchSize: 10_000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await execute(sql.insert_shared_question_usages, { start, end });
  },
});
