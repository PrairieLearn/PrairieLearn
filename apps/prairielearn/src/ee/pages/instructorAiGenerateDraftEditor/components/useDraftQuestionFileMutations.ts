import { useMutation } from '@tanstack/react-query';

import type {
  DraftQuestionFileBrowserActions,
  DraftUploadTarget,
} from '../../../../components/DraftQuestionFileBrowserActions.js';
import { unwrapAppResponse } from '../../../../lib/client/errors.js';

import { useTRPC } from './aiDraftFilesTrpc.js';

async function uploadDraftFile({
  uploadUrl,
  uploadCsrfToken,
  file,
  target,
}: {
  uploadUrl: string;
  uploadCsrfToken: string;
  file: File;
  target: DraftUploadTarget;
}): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('__csrf_token', uploadCsrfToken);
  formData.append('kind', target.kind);
  if (target.kind === 'replace') {
    formData.append('file_path', target.filePath);
  } else if (target.directory != null) {
    formData.append('directory', target.directory);
  }

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    headers: { Accept: 'application/json' },
  });

  // A failed sync job comes back as a `SYNC_JOB_FAILED` app error, surfaced the
  // same way the tRPC mutations' errors are so the file browser renders it
  // identically.
  await unwrapAppResponse(response);
}

/**
 * Wires the draft question file browser's upload/rename/delete actions to the
 * `aiDraftFiles` tRPC router and the editor's multipart upload endpoint. Each
 * action refreshes the file listing via `onMutated` on success; on failure it
 * rejects with an error the calling form renders.
 */
export function useDraftQuestionFileMutations({
  questionId,
  urlPrefix,
  uploadCsrfToken,
  onMutated,
}: {
  questionId: string;
  urlPrefix: string;
  uploadCsrfToken: string;
  onMutated: () => Promise<unknown>;
}): DraftQuestionFileBrowserActions {
  const trpc = useTRPC();
  const { mutateAsync: renameFile } = useMutation(trpc.aiDraftFiles.rename.mutationOptions());
  const { mutateAsync: deleteFile } = useMutation(trpc.aiDraftFiles.delete.mutationOptions());
  const uploadUrl = `${urlPrefix}/ai_generate_editor/${questionId}/files`;

  return {
    onUploadFile: async ({ file, target }) => {
      await uploadDraftFile({ uploadUrl, uploadCsrfToken, file, target });
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
  };
}
