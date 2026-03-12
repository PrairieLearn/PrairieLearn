import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { AssessmentQuestionSchema, AssessmentSchema, AssessmentSetSchema } from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const AssessmentQuestionContextSchema = z.object({
  assessment_question: AssessmentQuestionSchema,
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  assessment_label: z.string(),
  number_in_alternative_group: z.string(),
});

export type AssessmentQuestionContext = z.infer<typeof AssessmentQuestionContextSchema>;

const NavQuestionSchema = z.object({
  id: IdSchema,
  question_id: IdSchema,
  question_title: z.string(),
  qid: z.string().nullable(),
  question_number: z.string(),
});

export type NavQuestion = z.infer<typeof NavQuestionSchema>;

export async function loadAssessmentQuestionContext(
  assessmentQuestionId: string,
  questionId: string,
  courseInstanceId: string,
): Promise<AssessmentQuestionContext | null> {
  return sqldb.queryOptionalRow(
    sql.select_assessment_question_context,
    {
      assessment_question_id: assessmentQuestionId,
      question_id: questionId,
      course_instance_id: courseInstanceId,
    },
    AssessmentQuestionContextSchema,
  );
}

/**
 * Extracts the assessment question context from res.locals, if it was set by
 * the selectAndAuthzAssessmentQuestionFromQuery middleware.
 */
export function getAssessmentQuestionContext(
  resLocals: Record<string, any>,
): AssessmentQuestionContext | null {
  if (!resLocals.assessment_question) return null;
  return {
    assessment_question: resLocals.assessment_question,
    assessment: resLocals.assessment,
    assessment_set: resLocals.assessment_set,
    assessment_label: resLocals.assessment_label,
    number_in_alternative_group: resLocals.number_in_alternative_group,
  };
}

const QuestionAssessmentSchema = z.object({
  assessment_question_id: IdSchema,
  assessment_id: IdSchema,
  tid: z.string(),
  title: z.string(),
  number: z.string(),
  assessment_set: AssessmentSetSchema,
  label: z.string(),
});

export type QuestionAssessment = z.infer<typeof QuestionAssessmentSchema>;

export async function loadAssessmentsForQuestion(
  questionId: string,
  courseInstanceId: string,
): Promise<QuestionAssessment[]> {
  return sqldb.queryRows(
    sql.select_assessments_for_question,
    { question_id: questionId, course_instance_id: courseInstanceId },
    QuestionAssessmentSchema,
  );
}

export async function loadNavQuestions(
  assessmentId: string,
  assessmentQuestionId: string,
): Promise<{ prevQuestion: NavQuestion | null; nextQuestion: NavQuestion | null }> {
  const navQuestions = await sqldb.queryRows(
    sql.select_assessment_questions_for_nav,
    { assessment_id: assessmentId },
    NavQuestionSchema,
  );

  const currentIndex = navQuestions.findIndex((q) => q.id === assessmentQuestionId);
  const prevQuestion = currentIndex > 0 ? navQuestions[currentIndex - 1] : null;
  const nextQuestion =
    currentIndex < navQuestions.length - 1 ? navQuestions[currentIndex + 1] : null;

  return { prevQuestion, nextQuestion };
}
