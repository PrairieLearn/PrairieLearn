import { callbackify } from 'util';

import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { updateAssessmentQuestionStatsForAssessment } from '../lib/assessment';

const sql = loadSqlEquiv(__filename);

export async function runAsync() {
  const result = await queryAsync(sql.select_assessments, {});
  const assessments = result.rows;
  for (const assessment of assessments) {
    logger.verbose(`calculateAssessmentQuestionStats: processing assessment_id = ${assessment.id}`);
    await updateAssessmentQuestionStatsForAssessment(assessment.id);
  }
}
export const run = callbackify(runAsync);
