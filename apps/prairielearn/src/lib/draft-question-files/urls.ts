import { encodePathNoNormalize } from '../uri-util.shared.js';

import { CODE_EDITOR_TAB_FILES } from './paths.shared.js';
import { type DraftEditorSelection, ROOT_SELECTION } from './selection.js';

/**
 * Resolves where opening `selection` should land: files in
 * {@link CODE_EDITOR_TAB_FILES} route to the dedicated "Files" tab with the
 * selection cleared (that tab is their editor), everything else opens on the
 * "All files" tab. This is the single routing rule shared by in-app navigation
 * and href building.
 */
export function resolveSelectionNavigation(selection: DraftEditorSelection): {
  tab: 'files' | 'all-files';
  selection: DraftEditorSelection;
} {
  if (selection.kind === 'file' && CODE_EDITOR_TAB_FILES.has(selection.path)) {
    return { tab: 'files', selection: ROOT_SELECTION };
  }
  return { tab: 'all-files', selection };
}

/** The draft editor's base URL for a question. */
export function getDraftEditorUrl({
  urlPrefix,
  questionId,
}: {
  urlPrefix: string;
  questionId: string;
}): string {
  return `${urlPrefix}/ai_generate_editor/${questionId}`;
}

/**
 * URLs for viewing and downloading a draft question file, served by the
 * question-scoped `file_view` / `file_download` routes. `filePath` is relative
 * to the question root; `qid` comes from the browse data fetched alongside the
 * file so the two cannot drift after a rename.
 */
export function getDraftQuestionFileUrls({
  urlPrefix,
  questionId,
  qid,
  filePath,
}: {
  urlPrefix: string;
  questionId: string;
  qid: string;
  filePath: string;
}) {
  const questionUrl = `${urlPrefix}/question/${questionId}`;
  const encodedPath = encodePathNoNormalize(`questions/${qid}/${filePath}`);
  const rawDownloadUrl = `${questionUrl}/file_download/${encodedPath}`;
  const fileName = filePath.split('/').at(-1) ?? filePath;
  return {
    downloadUrl: `${rawDownloadUrl}?attachment=${encodeURIComponent(fileName)}`,
    fileViewUrl: `${questionUrl}/file_view/${encodedPath}`,
    imageUrl: rawDownloadUrl,
    pdfUrl: `${rawDownloadUrl}?type=application/pdf#view=FitH`,
  };
}
