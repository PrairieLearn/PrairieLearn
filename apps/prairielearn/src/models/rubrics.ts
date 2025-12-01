import { loadSqlEquiv, queryRow, queryRows } from "@prairielearn/postgres";
import { RubricItemSchema, RubricSchema, type Rubric, type RubricItem } from "../lib/db-types.js";

const sql = loadSqlEquiv(import.meta.url);

export async function selectCompleteRubric(assessment_question_id: string): Promise<{
    rubric: Rubric;
    rubric_items: RubricItem[];
}> {
    const rubric = await queryRow(
        sql.select_rubric,
        {
            assessment_question_id
        },
        RubricSchema
    );

    const rubric_items = await queryRows(
        sql.select_rubric_items,
        {
            assessment_question_id
        },
        RubricItemSchema
    )

    return {
        rubric,
        rubric_items
    }
}