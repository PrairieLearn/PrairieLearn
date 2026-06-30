import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { idsEqual } from '../lib/id.js';

import { type QuestionsPageData, QuestionsPageDataSchema } from './questions.types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Whether the course has at least one question available to add to an
 * assessment (i.e. not deleted and not a draft). Matches the criteria used by
 * the assessment question picker.
 */
export async function selectCourseHasQuestions(course_id: string | number): Promise<boolean> {
  return await sqldb.queryScalar(sql.select_course_has_questions, { course_id }, z.boolean());
}

export async function selectQuestionsForCourse(
  course_id: string | number,
  course_instance_ids: string[],
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_questions_for_course,
    { course_id },
    QuestionsPageDataSchema,
  );

  const questions = rows.map((row) => ({
    ...row,
    assessments: (row.assessments ?? []).filter((a) =>
      course_instance_ids.some((id) => idsEqual(id, a.assessment.course_instance_id)),
    ),
  }));
  return questions;
}

export async function selectPublicQuestionsForCourse(
  course_id: string | number,
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_public_questions_for_course,
    { course_id },
    QuestionsPageDataSchema,
  );

  return rows;
}
