import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import {
  loadSqlEquiv,
  queryScalar,
  queryScalars,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { updateAssessmentInstancesGradingPending } from '../models/assessment-instance.js';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryScalar(sql.select_max_id, z.bigint({ coerce: true }).nullable());
    return { min: 1n, max, batchSize: 1000 };
  },
  async execute(start: bigint, end: bigint): Promise<void> {
    await runInTransactionAsync(async () => {
      const ids = await queryScalars(sql.select_and_lock_batch, { start, end }, IdSchema);
      await updateAssessmentInstancesGradingPending(ids);
    });
  },
});
