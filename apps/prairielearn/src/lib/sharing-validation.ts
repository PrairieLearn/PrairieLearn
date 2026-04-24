import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const NonPublicQuestionSchema = z.object({ id: IdSchema, qid: z.string() });
export type NonPublicQuestion = z.infer<typeof NonPublicQuestionSchema>;

const NonPublicAssessmentSchema = z.object({ id: IdSchema, tid: z.string() });
export type NonPublicAssessment = z.infer<typeof NonPublicAssessmentSchema>;

export async function selectNonPublicQuestionsInAssessment({
  assessment_id,
}: {
  assessment_id: string;
}): Promise<NonPublicQuestion[]> {
  return await sqldb.queryRows(
    sql.select_non_public_questions_in_assessment,
    { assessment_id },
    NonPublicQuestionSchema,
  );
}

export async function selectNonPublicAssessmentsInCourseInstance({
  course_instance_id,
}: {
  course_instance_id: string;
}): Promise<NonPublicAssessment[]> {
  return await sqldb.queryRows(
    sql.select_non_public_assessments_in_course_instance,
    { course_instance_id },
    NonPublicAssessmentSchema,
  );
}
