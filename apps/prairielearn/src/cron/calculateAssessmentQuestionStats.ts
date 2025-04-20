import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { updateAssessmentQuestionStatsForAssessment } from '../lib/assessment.js';
import { IdSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function run() {
  const assessment_ids = await queryRows(sql.select_assessments, IdSchema);
  for (const assessment_id of assessment_ids) {
    logger.verbose(`calculateAssessmentQuestionStats: processing assessment_id = ${assessment_id}`);
    await updateAssessmentQuestionStatsForAssessment(assessment_id);
  }
}
