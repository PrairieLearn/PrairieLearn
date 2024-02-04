// @ts-check
import { callbackify } from 'util';

import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { updateAssessmentQuestionStatsForAssessment } from '../lib/assessment';
import { IdSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function runAsync() {
  const assessment_ids = await queryRows(sql.select_assessments, {}, IdSchema);
  for (const assessment_id of assessment_ids) {
    logger.verbose(`calculateAssessmentQuestionStats: processing assessment_id = ${assessment_id}`);
    await updateAssessmentQuestionStatsForAssessment(assessment_id);
  }
}
export const run = callbackify(runAsync);
