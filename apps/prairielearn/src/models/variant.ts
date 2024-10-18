import { type z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryAsync, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import { IdSchema, SubmissionSchema, type Variant, VariantSchema } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

const sql = loadSqlEquiv(import.meta.url);

const VariantWithScoreSchema = VariantSchema.extend({
  instance_question_id: IdSchema, // Since only variants assigned to instance questions are returned, this is never null.
  max_submission_score: SubmissionSchema.shape.score.unwrap(),
});
export type VariantWithScore = z.infer<typeof VariantWithScoreSchema>;

export async function selectVariantById(variant_id: string): Promise<Variant | null> {
  return queryOptionalRow(sql.select_variant_by_id, { variant_id }, VariantSchema);
}

export async function resetVariantsForAssessmentQuestion({
  assessment_id,
  unsafe_assessment_question_id,
  authn_user_id,
}: {
  assessment_id: string;
  unsafe_assessment_question_id: string;
  authn_user_id: string;
}) {
  await queryAsync(sql.reset_variants_for_assessment_question, {
    assessment_id,
    unsafe_assessment_question_id,
    authn_user_id,
  });
}

export async function resetVariantsForInstanceQuestion({
  assessment_instance_id,
  unsafe_instance_question_id,
  authn_user_id,
}: {
  assessment_instance_id: string;
  unsafe_instance_question_id: string;
  authn_user_id: string;
}) {
  await queryAsync(sql.reset_variants_for_instance_question, {
    assessment_instance_id,
    unsafe_instance_question_id,
    authn_user_id,
  });
}

export async function selectVariantsByInstanceQuestion({
  assessment_instance_id,
  instance_question_id,
}: {
  assessment_instance_id: string;
  instance_question_id?: string;
}) {
  return await queryRows(
    sql.select_variant_by_instance_question_id,
    { assessment_instance_id, instance_question_id },
    VariantWithScoreSchema,
  );
}
export async function validateVariantAgainstQuestion(
  unsafe_variant_id: string,
  question_id: string,
  instance_question_id: string | null = null,
): Promise<Variant> {
  const variant = await selectVariantById(unsafe_variant_id);
  if (variant == null || !idsEqual(variant.question_id, question_id)) {
    throw new HttpStatusError(
      400,
      `Client-provided variant ID ${unsafe_variant_id} is not valid for question ID ${question_id}.`,
    );
  }
  if (
    instance_question_id != null &&
    (!variant.instance_question_id || !idsEqual(variant.instance_question_id, instance_question_id))
  ) {
    throw new HttpStatusError(
      400,
      `Client-provided variant ID ${unsafe_variant_id} is not valid for instance question ID ${instance_question_id}.`,
    );
  }
  return variant;
}
