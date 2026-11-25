import z from 'zod';

import { loadSqlEquiv, queryOptionalScalar, queryRows } from '@prairielearn/postgres';

import {
  AssessmentQuestionSchema,
  AssessmentSchema,
  InstanceQuestionSchema,
  RubricSchema,
  SubmissionSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** Manual completion can leave the latest submission awaiting automatic grading. */
export async function selectPendingInstanceQuestions(
  scope: { assessment_instance_ids: string[] } | { instance_question_ids: string[] },
) {
  return await queryRows(
    sql.select_pending_instance_questions,
    {
      assessment_instance_ids:
        'assessment_instance_ids' in scope ? scope.assessment_instance_ids : [],
      instance_question_ids: 'instance_question_ids' in scope ? scope.instance_question_ids : [],
    },
    z.object({
      assessment: AssessmentSchema,
      assessment_question: AssessmentQuestionSchema,
      instance_question: InstanceQuestionSchema,
      rubric: RubricSchema.nullable(),
      credit: SubmissionSchema.shape.credit,
      auto_grading_pending: z.boolean(),
    }),
  );
}

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
