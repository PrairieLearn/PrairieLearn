import assert from 'assert';

import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type Question, QuestionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectQuestionById(question_id: string): Promise<Question> {
  return await queryRow(sql.select_question_by_id, { question_id }, QuestionSchema);
}

export async function selectOptionalQuestionById(question_id: string): Promise<Question | null> {
  return await queryOptionalRow(sql.select_question_by_id, { question_id }, QuestionSchema);
}

export async function selectQuestionsByIdsAndCourseId({
  question_ids,
  course_id,
}: {
  question_ids: string[];
  course_id: string;
}): Promise<Question[]> {
  return await queryRows(
    sql.select_questions_by_ids_and_course_id,
    { question_ids, course_id },
    QuestionSchema,
  );
}

/**
 * Returns the subset of `question_ids` (belonging to `course_id`) that are
 * referenced by assessments in other courses. Used to block destructive
 * mutations on shared questions whose deletion would break a consumer course's
 * sync.
 */
export async function selectQuestionsUsedInOtherCourses({
  question_ids,
  course_id,
}: {
  question_ids: string[];
  course_id: string;
}): Promise<{ id: string; qid: string }[]> {
  return await queryRows(
    sql.select_questions_used_in_other_courses,
    { question_ids, course_id },
    z.object({ id: IdSchema, qid: z.string() }),
  );
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

function getQuestionUpdateParams(patch: {
  deleted_at?: Date | null;
  share_publicly?: boolean;
  share_source_publicly?: boolean;
}) {
  assert(process.env.NODE_ENV === 'test');

  const hasDeletedAt = patch.deleted_at !== undefined;
  const hasSharePublicly = patch.share_publicly !== undefined;
  const hasShareSourcePublicly = patch.share_source_publicly !== undefined;
  assert(hasDeletedAt || hasSharePublicly || hasShareSourcePublicly);

  return {
    update_deleted_at: hasDeletedAt,
    deleted_at: patch.deleted_at ?? null,
    update_share_publicly: hasSharePublicly,
    share_publicly: patch.share_publicly ?? false,
    update_share_source_publicly: hasShareSourcePublicly,
    share_source_publicly: patch.share_source_publicly ?? false,
  };
}

/**
 * Testing helper for temporarily changing a whitelisted subset of fields on one question.
 * Must only be called in test environments.
 */
export async function updateQuestion({
  question_id,
  patch,
}: {
  question_id: string;
  patch: {
    deleted_at?: Date | null;
    share_publicly?: boolean;
    share_source_publicly?: boolean;
  };
}): Promise<void> {
  await execute(sql.update_question, {
    ...getQuestionUpdateParams(patch),
    question_id,
  });
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
