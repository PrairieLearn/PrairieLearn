import { queryRow, loadSqlEquiv } from '@prairielearn/postgres';

import { type Assessment, AssessmentSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentById(assessment_id: string): Promise<Assessment> {
    return await queryRow(
      sql.select_assessment_by_id,
      {
        assessment_id,
      },
      AssessmentSchema,
    );
}