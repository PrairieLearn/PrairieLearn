import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { insertPrintFormQuestions } from '../models/print-form-question.js';
import { insertPrintForm } from '../models/print-form.js';

import {
  type Assessment,
  AssessmentQuestionSchema,
  type Course,
  type CourseInstance,
  type PrintFormQuestion,
  QuestionSchema,
} from './db-types.js';
import { ensureVariant, getQuestionCourse } from './question-variant.js';

const sql = loadSqlEquiv(import.meta.url);

/** Creates an independent form with saved question selection, ordering, and variants. */
export async function createPrintForm({
  assessment,
  course,
  courseInstance,
  userId,
  authnUserId,
}: {
  assessment: Assessment;
  course: Course;
  courseInstance: CourseInstance;
  userId: string;
  authnUserId: string;
}) {
  const selectedQuestions = await queryRows(
    sql.select_questions_for_new_form,
    { assessment_id: assessment.id },
    z.object({
      assessment_question: AssessmentQuestionSchema,
      question: QuestionSchema,
      position: z.number(),
      question_number: z.string(),
    }),
  );
  if (selectedQuestions.length === 0) {
    throw new HttpStatusError(400, 'This assessment has no questions to print.');
  }

  const questions: Omit<PrintFormQuestion, 'id' | 'print_form_id'>[] = [];
  for (const selected of selectedQuestions) {
    const variant = await ensureVariant({
      question_id: selected.question.id,
      instance_question_id: null,
      user_id: userId,
      authn_user_id: authnUserId,
      course_instance: courseInstance,
      variant_course: course,
      question_course: await getQuestionCourse(selected.question, course),
      options: { preferences: selected.assessment_question.preferences ?? {} },
      require_open: false,
      client_fingerprint_id: null,
    });
    questions.push({
      assessment_question_id: selected.assessment_question.id,
      variant_id: variant.id,
      position: selected.position,
      question_number: selected.question_number,
      max_points: selected.assessment_question.max_points ?? 0,
    });
  }

  return await runInTransactionAsync(async () => {
    const form = await insertPrintForm({ assessmentId: assessment.id, userId, authnUserId });
    await insertPrintFormQuestions({ printFormId: form.id, questions });
    return form;
  });
}
