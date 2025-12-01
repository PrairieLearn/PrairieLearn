import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import { type Rubric, type RubricItem, RubricItemSchema, RubricSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectCompleteRubric(assessment_question_id: string): Promise<{
  rubric: Rubric | null;
  rubric_items: RubricItem[];
}> {
  const rubric = await queryOptionalRow(
    sql.select_rubric,
    {
      assessment_question_id,
    },
    RubricSchema,
  );

  if (!rubric) {
    return {
      rubric: null,
      rubric_items: [],
    };
  }

  const rubric_items = await queryRows(
    sql.select_rubric_items,
    {
      assessment_question_id,
    },
    RubricItemSchema,
  );

  return {
    rubric,
    rubric_items,
  };
}
