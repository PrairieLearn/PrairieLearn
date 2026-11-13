import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import {
  AssessmentQuestionSchema,
  type PrintFormQuestion,
  PrintFormQuestionSchema,
  QuestionSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);
const PrintFormQuestionWithQuestionSchema = z.object({
  print_form_question: PrintFormQuestionSchema,
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
});

export async function insertPrintFormQuestions({
  printFormId,
  questions,
}: {
  printFormId: string;
  questions: Omit<PrintFormQuestion, 'id' | 'print_form_id'>[];
}) {
  return await queryRows(
    sql.insert_print_form_questions,
    { print_form_id: printFormId, questions: JSON.stringify(questions) },
    PrintFormQuestionSchema,
  );
}

export async function selectPrintFormQuestions(printFormId: string) {
  return await queryRows(
    sql.select_print_form_questions,
    { print_form_id: printFormId },
    PrintFormQuestionWithQuestionSchema,
  );
}

export async function selectOptionalPrintFormQuestion({
  printFormId,
  printFormQuestionId,
}: {
  printFormId: string;
  printFormQuestionId: string;
}) {
  return await queryOptionalRow(
    sql.select_optional_print_form_question,
    { print_form_id: printFormId, print_form_question_id: printFormQuestionId },
    PrintFormQuestionWithQuestionSchema,
  );
}
