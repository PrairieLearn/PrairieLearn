import { z } from 'zod';

import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import type { Assessment, AssessmentQuestion } from '../../../lib/db-types.js';

import { InstanceQuestionRowSchema } from './assessmentQuestion.types.js';

const sql = loadSqlEquiv(import.meta.url);

const RubricSettingsContextKeyRowsSchema = z.object({
  variant_params: z.record(z.string(), z.unknown()).nullable(),
  variant_true_answer: z.record(z.string(), z.unknown()).nullable(),
  submission_submitted_answer: z.record(z.string(), z.unknown()).nullable(),
});
export type RubricSettingsContextKeys = z.infer<typeof RubricSettingsContextKeyRowsSchema>;

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

export async function selectRubricSettingsContextKeys({
  assessment_question,
}: {
  assessment_question: AssessmentQuestion;
}): Promise<RubricSettingsContextKeys> {
  const variants = await queryRows(
    sql.select_rubric_settings_context_keys,
    { assessment_question_id: assessment_question.id },
    RubricSettingsContextKeyRowsSchema,
  );

  // Aggregate the keys across all variants to get the full set of keys that
  // should be included in the context. Values are not relevant, so just set
  // them all to true.
  return {
    variant_params: Object.fromEntries(
      variants
        .flatMap((variant) => Object.keys(variant.variant_params ?? {}))
        .map((key) => [key, true]),
    ),
    variant_true_answer: Object.fromEntries(
      variants
        .flatMap((variant) => Object.keys(variant.variant_true_answer ?? {}))
        .map((key) => [key, true]),
    ),
    submission_submitted_answer: Object.fromEntries(
      variants
        .flatMap((variant) => Object.keys(variant.submission_submitted_answer ?? {}))
        .map((key) => [key, true]),
    ),
  };
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
