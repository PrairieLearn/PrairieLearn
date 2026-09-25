import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type SubmissionDraft, SubmissionDraftSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function upsertSubmissionDraft({
  variant_id,
  user_id,
  raw_submitted_answer,
}: {
  variant_id: string;
  user_id: string;
  raw_submitted_answer: Record<string, any>;
}) {
  await execute(sql.upsert_submission_draft, { variant_id, user_id, raw_submitted_answer });
}

export async function selectOptionalSubmissionDraft({
  variant_id,
  user_id,
}: {
  variant_id: string;
  user_id: string;
}): Promise<SubmissionDraft | null> {
  return await queryOptionalRow(
    sql.select_submission_draft,
    { variant_id, user_id },
    SubmissionDraftSchema,
  );
}

export async function deleteSubmissionDraft({
  variant_id,
  user_id,
}: {
  variant_id: string;
  user_id: string;
}) {
  await execute(sql.delete_submission_draft, { variant_id, user_id });
}

/**
 * Drafts only exist to recover work that hasn't been submitted yet, so any
 * submission to a variant supersedes every draft for it, including drafts
 * from other members of a group.
 */
export async function deleteSubmissionDraftsForVariant({ variant_id }: { variant_id: string }) {
  await execute(sql.delete_submission_drafts_for_variant, { variant_id });
}

export async function deleteExpiredSubmissionDrafts({
  retention_period_sec,
}: {
  retention_period_sec: number;
}): Promise<number> {
  return await execute(sql.delete_expired_submission_drafts, { retention_period_sec });
}
