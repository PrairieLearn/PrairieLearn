import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { type SubmissionDraft, SubmissionDraftSchema } from '../lib/db-types.js';

import { selectOptionalLatestSubmissionIdForVariant } from './submission.js';
import { lockVariant } from './variant.js';

const sql = loadSqlEquiv(import.meta.url);

export async function upsertSubmissionDraft({
  variant_id,
  user_id,
  base_submission_id,
  client_id,
  revision,
  raw_submitted_answer,
  is_cleared,
}: {
  variant_id: string;
  user_id: string;
  base_submission_id: string | null;
  client_id: string;
  revision: number;
  raw_submitted_answer: Record<string, any>;
  is_cleared: boolean;
}): Promise<{ saved: true } | { saved: false; latestSubmissionId: string | null }> {
  return await runInTransactionAsync(async () => {
    // A submission uses the same lock before clearing drafts. This prevents a
    // draft from an older page from being written after that submission.
    await lockVariant({ variant_id });
    const latestSubmissionId = await selectOptionalLatestSubmissionIdForVariant({ variant_id });
    if (latestSubmissionId !== base_submission_id) {
      return { saved: false, latestSubmissionId };
    }

    await execute(sql.upsert_submission_draft, {
      variant_id,
      user_id,
      client_id,
      revision,
      raw_submitted_answer,
      is_cleared,
    });
    return { saved: true };
  });
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
