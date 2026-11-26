import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryOptionalScalar,
  queryRows,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  InstanceQuestionSchema,
  QuestionSchema,
  type UnsavedSubmission,
  UnsavedSubmissionSchema,
  UnsavedSubmissionStateSchema,
  UserSchema,
  VariantSchema,
} from '../lib/db-types.js';

import { lockVariant } from './variant.js';

const sql = loadSqlEquiv(import.meta.url);

/** Locks draft state until the caller's transaction finishes. Requires an active transaction. */
export async function lockUnsavedSubmissionState({
  instance_question_id,
  user_id,
}: {
  instance_question_id: string;
  user_id: string;
}): Promise<void> {
  await execute(sql.lock_unsaved_submission_state, { instance_question_id, user_id });
}

export async function upsertUnsavedSubmission({
  variant_id,
  instance_question_id,
  user_id,
  credit,
  raw_submitted_answer,
  uuid,
  generation,
}: {
  variant_id: string;
  instance_question_id: string;
  user_id: string;
  credit: number | null;
  raw_submitted_answer: UnsavedSubmission['raw_submitted_answer'];
  uuid: string;
  generation: number;
}): Promise<boolean> {
  return await runInTransactionAsync(async () => {
    await lockVariant({ variant_id });
    await lockUnsavedSubmissionState({ instance_question_id, user_id });
    const id = await queryOptionalScalar(
      sql.upsert_unsaved_submission,
      {
        variant_id,
        instance_question_id,
        user_id,
        credit,
        raw_submitted_answer,
        uuid,
        generation,
      },
      IdSchema,
    );
    return id !== null;
  });
}

export async function deleteUnsavedSubmission({
  instance_question_id,
  user_id,
  uuid,
  generation,
}: {
  instance_question_id: string;
  user_id: string;
  uuid: string;
  generation: number;
}) {
  await runInTransactionAsync(async () => {
    await lockUnsavedSubmissionState({ instance_question_id, user_id });
    await execute(sql.delete_unsaved_submission, {
      instance_question_id,
      user_id,
      uuid,
      generation,
    });
  });
}

/** Pass a null user ID to clear drafts and invalidate captures for the entire group. */
export async function deleteUnsavedSubmissions({
  instance_question_id,
  user_id,
}: {
  instance_question_id: string;
  user_id: string | null;
}) {
  await execute(sql.delete_unsaved_submissions, { instance_question_id, user_id });
}

export async function selectUnsavedSubmissionGeneration({
  instance_question_id,
  user_id,
}: {
  instance_question_id: string;
  user_id: string;
}): Promise<number> {
  return await queryScalar(
    sql.select_unsaved_submission_generation,
    { instance_question_id, user_id },
    UnsavedSubmissionStateSchema.shape.generation,
  );
}

export async function hasUnsavedSubmission({
  instance_question_id,
  user_id,
  variant_id,
}: {
  instance_question_id: string;
  user_id: string;
  variant_id: string;
}): Promise<boolean> {
  return await queryScalar(
    sql.has_unsaved_submission,
    { instance_question_id, user_id, variant_id },
    z.boolean(),
  );
}

export async function selectOptionalUnsavedSubmission({
  instance_question_id,
  user_id,
  variant_id,
}: {
  instance_question_id: string;
  user_id: string;
  variant_id: string;
}): Promise<UnsavedSubmission | null> {
  return await queryOptionalRow(
    sql.select_optional_unsaved_submission,
    { instance_question_id, user_id, variant_id },
    UnsavedSubmissionSchema,
  );
}

export async function selectOptionalUnsavedSubmissionUpdatedAt({
  instance_question_id,
  user_id,
  variant_id,
}: {
  instance_question_id: string;
  user_id: string;
  variant_id: string;
}): Promise<Date | null> {
  return await queryOptionalScalar(
    sql.select_optional_unsaved_submission_updated_at,
    { instance_question_id, user_id, variant_id },
    UnsavedSubmissionSchema.shape.updated_at,
  );
}

const UnsavedSubmissionMetadataSchema = z.object({
  unsaved_submission: UnsavedSubmissionSchema.pick({
    id: true,
    updated_at: true,
    instance_question_id: true,
    variant_id: true,
    user_id: true,
    credit: true,
  }),
  user: UserSchema,
  variant_invalidated: z.boolean(),
  assessment_instance_id: IdSchema,
  revision: z.string(),
});

export type UnsavedSubmissionMetadata = z.infer<typeof UnsavedSubmissionMetadataSchema>;

export async function selectUnsavedSubmissionsForAssessmentInstance({
  assessment_instance_id,
  assessment_id,
}: {
  assessment_instance_id: string;
  assessment_id: string;
}): Promise<UnsavedSubmissionMetadata[]> {
  return await queryRows(
    sql.select_unsaved_submissions_for_assessment_instance,
    { assessment_instance_id, assessment_id },
    UnsavedSubmissionMetadataSchema,
  );
}

export async function selectOptionalUnsavedSubmissionMetadataForAssessment({
  unsaved_submission_id,
  assessment_id,
}: {
  unsaved_submission_id: string;
  assessment_id: string;
}): Promise<UnsavedSubmissionMetadata | null> {
  return await queryOptionalRow(
    sql.select_optional_unsaved_submission_metadata_for_assessment,
    { unsaved_submission_id, assessment_id },
    UnsavedSubmissionMetadataSchema,
  );
}

const UnsavedSubmissionForAssessmentSchema = z.object({
  unsaved_submission: UnsavedSubmissionSchema,
  user: UserSchema,
  variant: VariantSchema,
  question: QuestionSchema,
  instance_question: InstanceQuestionSchema,
  assessment_instance_id: IdSchema,
  revision: z.string(),
});

export type UnsavedSubmissionForAssessment = z.infer<typeof UnsavedSubmissionForAssessmentSchema>;

export async function selectOptionalUnsavedSubmissionForAssessment({
  unsaved_submission_id,
  assessment_id,
}: {
  unsaved_submission_id: string;
  assessment_id: string;
}): Promise<UnsavedSubmissionForAssessment | null> {
  return await queryOptionalRow(
    sql.select_optional_unsaved_submission_for_assessment,
    { unsaved_submission_id, assessment_id },
    UnsavedSubmissionForAssessmentSchema,
  );
}
