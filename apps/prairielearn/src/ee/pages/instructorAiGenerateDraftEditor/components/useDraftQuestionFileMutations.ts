import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { DraftQuestionFileBrowserActions } from '../../../../components/DraftQuestionFileBrowserActions.js';
import type { DraftQuestionFileEditResult } from '../../../../lib/draft-question-files.js';

import { useTRPC } from './aiDraftFilesTrpc.js';
import { applyDraftFileEditResult } from './draftFileEditResult.js';

async function getResponseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error !== '') return body.error;
  } catch {
    // Fall through to the generic message below.
  }
  return 'Failed to upload file.';
}

/**
 * Wires the draft question file browser's upload/rename/delete actions to the
 * `aiDraftFiles` tRPC router and the editor's multipart upload endpoint. Each
 * action refreshes the file listing via `onMutated` on success, or navigates to
 * the edit error page when the underlying server job fails.
 */
export function useDraftQuestionFileMutations({
  questionId,
  uploadUrl,
  uploadCsrfToken,
  onMutated,
}: {
  questionId: string;
  uploadUrl: string;
  uploadCsrfToken: string;
  onMutated: () => Promise<unknown>;
}): DraftQuestionFileBrowserActions {
  const trpc = useTRPC();
  const { mutateAsync: renameFile } = useMutation(trpc.aiDraftFiles.rename.mutationOptions());
  const { mutateAsync: deleteFile } = useMutation(trpc.aiDraftFiles.delete.mutationOptions());

  return useMemo(
    () => ({
      onUploadFile: async ({ file, targetFilePath, directory }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('__csrf_token', uploadCsrfToken);
        if (targetFilePath != null) {
          formData.append('file_path', targetFilePath);
        } else if (directory != null) {
          formData.append('directory', directory);
        }

        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(await getResponseErrorMessage(response));
        }
        await applyDraftFileEditResult(
          (await response.json()) as DraftQuestionFileEditResult,
          onMutated,
        );
      },
      onRenameFile: async ({ oldFilePath, newFilePath }) => {
        await applyDraftFileEditResult(
          await renameFile({ questionId, oldFilePath, newFilePath }),
          onMutated,
        );
      },
      onDeleteFile: async ({ filePath }) => {
        await applyDraftFileEditResult(await deleteFile({ questionId, filePath }), onMutated);
      },
    }),
    [questionId, uploadUrl, uploadCsrfToken, onMutated, renameFile, deleteFile],
  );
}
