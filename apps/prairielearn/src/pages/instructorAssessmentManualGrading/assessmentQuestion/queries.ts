import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import type { Assessment, AssessmentQuestion } from '../../../lib/db-types.js';

import { InstanceQuestionRowSchema } from './assessmentQuestion.types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectInstanceQuestionsForManualGrading({
  assessment,
  assessment_question,
}: {
  assessment: Assessment;
  assessment_question: AssessmentQuestion;
}) {
  return await queryRows(
    sql.select_instance_questions_manual_grading,
    {
      assessment_id: assessment.id,
      assessment_question_id: assessment_question.id,
    },
    InstanceQuestionRowSchema,
  );
}

export async function updateInstanceQuestions({
  assessment_question,
  instance_question_ids,
  update_requires_manual_grading,
  requires_manual_grading,
  update_assigned_grader,
  assigned_grader,
}: {
  assessment_question: AssessmentQuestion;
  instance_question_ids: string[];
  update_requires_manual_grading: boolean;
  requires_manual_grading: boolean | null;
  update_assigned_grader: boolean;
  assigned_grader: string | null;
}) {
  await execute(sql.update_instance_questions, {
    assessment_question_id: assessment_question.id,
    instance_question_ids,
    update_requires_manual_grading,
    requires_manual_grading,
    update_assigned_grader,
    assigned_grader,
  });
}
