import { useMutation } from '@tanstack/react-query';

import { useTRPC } from '../../../../trpc/course/context.js';

import type {
  DraftQuestionFileBrowserActions,
  DraftUploadTarget,
} from './DraftQuestionFileBrowserActions.js';
import { useDraftFiles } from './draftFilesContext.js';

/**
 * Builds the `multipart/form-data` body for the `upload` tRPC mutation, which
 * accepts `FormData` (tRPC has no JSON encoding for file payloads). The field
 * names mirror the server's `UploadFieldsSchema`.
 */
function buildUploadFormData({
  questionId,
  file,
  target,
}: {
  questionId: string;
  file: File;
  target: DraftUploadTarget;
}): FormData {
  const formData = new FormData();
  formData.append('questionId', questionId);
  formData.append('file', file);
  formData.append('kind', target.kind);
  if (target.kind === 'replace') {
    formData.append('filePath', target.filePath);
  } else if (target.directory != null) {
    formData.append('directory', target.directory);
  }
  return formData;
}

/**
 * Wires the draft question file browser's upload/rename/delete actions to the
 * `aiDraftFiles` tRPC router. Each action refreshes the file data and question
 * preview via `onFileMutated` on success; on failure it rejects with an error
 * the calling form renders.
 */
export function useDraftQuestionFileMutations(): DraftQuestionFileBrowserActions {
  const { questionId, onFileMutated } = useDraftFiles();
  const trpc = useTRPC();
  const { mutateAsync: uploadFile } = useMutation(trpc.aiDraftFiles.upload.mutationOptions());
  const { mutateAsync: renameFile } = useMutation(trpc.aiDraftFiles.rename.mutationOptions());
  const { mutateAsync: deleteFile } = useMutation(trpc.aiDraftFiles.delete.mutationOptions());

  return {
    onUploadFile: async ({ file, target }) => {
      await uploadFile(buildUploadFormData({ questionId, file, target }));
      await onFileMutated();
    },
    onRenameFile: async ({ oldFilePath, newFilePath }) => {
      await renameFile({ questionId, oldFilePath, newFilePath });
      await onFileMutated();
    },
    onDeleteFile: async ({ filePath }) => {
      await deleteFile({ questionId, filePath });
      await onFileMutated();
    },
  };
}
