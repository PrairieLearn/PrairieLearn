import type { DraftQuestionFileEditResult } from '../../../../lib/draft-question-files.js';

/**
 * Applies the result of a draft question file mutation: navigates to the
 * `edit_error` page when the underlying server job failed, or runs `onSuccess`
 * (typically a file-listing refetch) when it succeeded.
 *
 * Shared by every draft-file mutation — upload, rename, delete, and save — so
 * they all interpret the common {@link DraftQuestionFileEditResult} shape the
 * same way.
 */
export async function applyDraftFileEditResult(
  result: DraftQuestionFileEditResult,
  onSuccess: () => Promise<unknown>,
): Promise<void> {
  if (result.status === 'error') {
    window.location.href = result.editErrorUrl;
    return;
  }
  await onSuccess();
}
