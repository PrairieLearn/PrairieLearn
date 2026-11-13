import { makeBatchedMigration } from '@prairielearn/migrations';
import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { updateAssessmentInstancesScorePending } from '../lib/assessment-grading.js';
import { selectAssessmentInstanceIdsForPendingScoreRefresh } from '../models/assessment-instance.js';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryScalar(sql.select_bounds, IdSchema.nullable());
    return { min: 1n, max: max == null ? null : BigInt(max), batchSize: 1000 };
  },
  async execute(start: bigint, end: bigint) {
    const ids = await selectAssessmentInstanceIdsForPendingScoreRefresh({
      start_id: start.toString(),
      end_id: end.toString(),
    });
    await updateAssessmentInstancesScorePending(ids, null, { log: 'never' });
  },
});
