import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

import { type AssessmentQuestion, AssessmentQuestionSchema } from '../lib/db-types.js';

export async function selectAssessmentQuestionById(id: string): Promise<AssessmentQuestion> {
  return await sqldb.queryRow(
    sql.select_assessment_question_by_id,
    { id },
    AssessmentQuestionSchema,
  );
}

export async function selectAssessmentQuestionByQuestionId({
  assessment_id,
  question_id,
}: {
  assessment_id: string;
  question_id: string;
}): Promise<AssessmentQuestion> {
  return await sqldb.queryRow(
    sql.select_assessment_question_by_question_id,
    { assessment_id, question_id },
    AssessmentQuestionSchema,
  );
}
