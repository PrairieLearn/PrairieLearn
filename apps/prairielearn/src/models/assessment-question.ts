import * as sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(import.meta.url);

import {
  type AssessmentQuestionRow,
  AssessmentQuestionRowSchema,
} from '../models/assessment-question.types.js';

export async function selectAssessmentQuestions(
  assessment_id: string,
): Promise<AssessmentQuestionRow[]> {
  const rows = await sqldb.queryRows(
    sql.select_assessment_questions,
    { assessment_id },
    AssessmentQuestionRowSchema,
  );

  return rows;
}
