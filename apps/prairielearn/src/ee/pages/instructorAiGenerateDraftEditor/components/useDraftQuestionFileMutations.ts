import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { DraftQuestionFileBrowserActions } from '../../../../components/DraftQuestionFileBrowserActions.js';
import { AppErrorException } from '../../../../lib/client/errors.js';

import { useTRPC } from './aiDraftFilesTrpc.js';

/**
 * The draft file upload route's response: a job sequence id when the edit
 * failed to sync, or `null` on success.
 */
interface UploadResponse {
  jobSequenceId: string | null;
}

async function getResponseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error !== '') return body.error;
  } catch {
    // Fall through to the generic message below.
  }
  return 'Failed to upload file.';
}

async function uploadDraftFile({
  uploadUrl,
  uploadCsrfToken,
  file,
  targetFilePath,
  directory,
}: {
  uploadUrl: string;
  uploadCsrfToken: string;
  file: File;
  targetFilePath: string | null;
  directory: string | null;
}): Promise<void> {
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

  const { jobSequenceId } = (await response.json()) as UploadResponse;
  if (jobSequenceId != null) {
    // Surface a failed sync job as the same typed error the tRPC mutations
    // raise, so the file browser renders it identically.
    throw new AppErrorException({
      code: 'SYNC_JOB_FAILED',
      message: 'The file upload failed to sync.',
      jobSequenceId,
    });
  }
}

/**
 * Wires the draft question file browser's upload/rename/delete actions to the
 * `aiDraftFiles` tRPC router and the editor's multipart upload endpoint. Each
 * action refreshes the file listing via `onMutated` on success; on failure it
 * rejects with an error the calling form renders.
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
        await uploadDraftFile({ uploadUrl, uploadCsrfToken, file, targetFilePath, directory });
        await onMutated();
      },
      onRenameFile: async ({ oldFilePath, newFilePath }) => {
        await renameFile({ questionId, oldFilePath, newFilePath });
        await onMutated();
      },
      onDeleteFile: async ({ filePath }) => {
        await deleteFile({ questionId, filePath });
        await onMutated();
      },
    }),
    [questionId, uploadUrl, uploadCsrfToken, onMutated, renameFile, deleteFile],
  );
}
