import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

import { type Question, QuestionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectQuestionById(question_id: string): Promise<Question> {
  return await queryRow(sql.select_question_by_id, { question_id }, QuestionSchema);
}

export async function selectOptionalQuestionById(question_id: string): Promise<Question | null> {
  return await queryOptionalRow(sql.select_question_by_id, { question_id }, QuestionSchema);
}

export async function selectQuestionByQid({
  qid,
  course_id,
}: {
  qid: string;
  course_id: string;
}): Promise<Question> {
  return await queryRow(sql.select_question_by_qid, { qid, course_id }, QuestionSchema);
}

export async function selectOptionalQuestionByQid({
  qid,
  course_id,
}: {
  qid: string;
  course_id: string;
}): Promise<Question | null> {
  return await queryOptionalRow(sql.select_question_by_qid, { qid, course_id }, QuestionSchema);
}

export async function selectQuestionByUuid({
  course_id,
  uuid,
}: {
  course_id: string;
  uuid: string;
}): Promise<Question> {
  return await queryRow(sql.select_question_by_uuid, { course_id, uuid }, QuestionSchema);
}

export async function selectQuestionByInstanceQuestionId(
  instance_question_id: string,
): Promise<Question> {
  return await queryRow(
    sql.select_question_by_instance_question_id,
    { instance_question_id },
    QuestionSchema,
  );
}

type QuestionForCopy = Question & { should_copy?: boolean };

export async function selectQuestionsForCourseInstanceCopy(
  course_instance_id: string,
): Promise<QuestionForCopy[]> {
  const questions: QuestionForCopy[] = await queryRows(
    sql.select_questions_for_course_instance_copy,
    { course_instance_id },
    QuestionSchema,
  );
  questions.forEach((question) => {
    // TODO: in the future it would be nice to give users an option about if they
    // want to copy questions while copying a course instance or not. For now,
    // we just default to only copying them if they are not importable.
    question.should_copy = !question.share_publicly;
  });
  return questions;
}
