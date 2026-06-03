import z from 'zod';

import { loadSqlEquiv, queryOptionalScalar, queryRows } from '@prairielearn/postgres';

import {
  CourseSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  UserSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const InstanceQuestionForGenerationSchema = z.object({
  instance_question: InstanceQuestionSchema,
  question: QuestionSchema,
  user: UserSchema,
  question_course: CourseSchema,
});
export type InstanceQuestionForGeneration = z.infer<typeof InstanceQuestionForGenerationSchema>;

export async function computeNextAllowedGradingTimeMs({
  instanceQuestionId,
}: {
  instanceQuestionId: string;
}): Promise<number> {
  const result = await queryOptionalScalar(
    sql.compute_next_allowed_grading_time_ms,
    { instance_question_id: instanceQuestionId },
    z.number().nullable(),
  );
  return result ?? 0;
}

/**
 * Selects every open instance question across the open assessment instances of
 * an assessment, joined to the question, the question's course, and the student
 * (the assessment instance's user, or a random member for team assessments).
 * Returns the context needed to generate a test submission for each.
 */
export async function selectOpenInstanceQuestionsForAssessment(
  assessment_id: string,
): Promise<InstanceQuestionForGeneration[]> {
  return await queryRows(
    sql.select_open_instance_questions_for_assessment,
    { assessment_id },
    InstanceQuestionForGenerationSchema,
  );
}
