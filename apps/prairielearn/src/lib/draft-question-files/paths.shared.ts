/**
 * Path helpers safe to bundle into the browser. Must not import `node:*` or
 * other server-only modules — see `paths.ts` for the filesystem helpers and zod
 * schemas.
 */

export const DRAFT_INFO_JSON_DISABLED_REASON =
  'Question metadata (info.json) cannot be modified inside the draft editor.';

/**
 * Files edited through the dedicated "Files" tab rather than the per-file
 * editor on the "All files" tab. Clicking these files from the file browser
 * routes to the "Files" tab to avoid having two editor surfaces for the same
 * file (which could desync via independent local edits).
 */
export const CODE_EDITOR_TAB_FILES = new Set(['question.html', 'server.py']);

/**
 * Allowed pattern for renamed or newly created draft question file paths: path
 * segments of letters, numbers, dashes, and underscores, joined by `/`, with an
 * optional extension. Unlike the instructor file browser's `FILE_NAME_PATTERN`
 * (`lib/file-browser.shared.ts`), `..` segments are rejected: files must stay
 * inside the question directory, matching the server's
 * `ModifiableQuestionFilePathSchema`. Anchored for use with `.test()`.
 */
export const QUESTION_FILE_NAME_PATTERN =
  /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\.[A-Za-z0-9_-]+)?$/;

/**
 * Help text for {@link QUESTION_FILE_NAME_PATTERN}. It describes placing a file
 * in a subdirectory rather than moving it elsewhere, since a draft question
 * file cannot escape the question directory.
 */
export const QUESTION_FILE_NAME_PATTERN_DESCRIPTION =
  'Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is recommended, delimited by a period. To place the file in a subdirectory, specify a relative path delimited by forward slashes.';

/**
 * Whether a path stays within the question root: non-empty, free of null bytes
 * and backslashes, not absolute, and without any `..` segments. The single
 * predicate behind both the client's selection parsing and the server's path
 * schemas, so the two can never disagree about what is in bounds.
 */
export function isSafeQuestionRelativePath(value: string): boolean {
  if (value === '' || value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/')) return false;
  return !value.split('/').includes('..');
}

/**
 * Returns the reason a question-relative path can't be created or replaced by a
 * file upload, or `null` if uploading is allowed. `filePath` is a POSIX path
 * relative to the question root; surrounding whitespace is ignored so that
 * client-constructed paths (e.g. from a raw upload file name) match too.
 */
export function getReservedDraftUploadReason(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (trimmed === 'info.json') return DRAFT_INFO_JSON_DISABLED_REASON;
  if (CODE_EDITOR_TAB_FILES.has(trimmed)) {
    return `${trimmed} must be edited from the Files tab.`;
  }
  return null;
}
