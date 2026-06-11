import { type DraftEditorSelection, ROOT_SELECTION } from './selection.js';

/**
 * Files edited through the dedicated "Files" tab rather than the per-file
 * editor on the "All files" tab. Clicking these files from the file browser
 * routes to the "Files" tab to avoid having two editor surfaces for the same
 * file (which could desync via independent local edits).
 */
export const CODE_EDITOR_TAB_FILES = new Set(['question.html', 'server.py']);

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
 * Encodes a course-relative POSIX path for use in a URL, preserving slashes.
 * Client-safe equivalent of `encodePath` in `lib/uri-util.ts` for paths that
 * are already normalized.
 */
function encodeCourseRelativePath(courseRelativePath: string): string {
  return courseRelativePath.split('/').map(encodeURIComponent).join('/');
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
  const encodedPath = encodeCourseRelativePath(`questions/${qid}/${filePath}`);
  const rawDownloadUrl = `${questionUrl}/file_download/${encodedPath}`;
  const fileName = filePath.split('/').at(-1) ?? filePath;
  return {
    downloadUrl: `${rawDownloadUrl}?attachment=${encodeURIComponent(fileName)}`,
    fileViewUrl: `${questionUrl}/file_view/${encodedPath}`,
    imageUrl: rawDownloadUrl,
    pdfUrl: `${rawDownloadUrl}?type=application/pdf#view=FitH`,
  };
}
