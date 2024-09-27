import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../lib/db-types.js';

import { CourseData } from './course-db.js';
const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function getInvalidRenames(
  courseId: string,
  courseData: CourseData,
): Promise<string[]> {
  const sharedQuestions = await sqldb.queryRows(
    sql.select_shared_questions,
    { course_id: courseId },
    z.object({
      id: IdSchema,
      qid: z.string(),
    }),
  );
  const invalidRenames: string[] = [];
  sharedQuestions.forEach((question) => {
    if (!courseData.questions[question.qid]) {
      invalidRenames.push(question.qid);
    }
  });
  return invalidRenames;
}
