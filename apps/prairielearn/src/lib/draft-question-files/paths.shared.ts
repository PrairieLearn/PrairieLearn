/**
 * Path helpers safe to bundle into the browser. Must not import `node:*` or
 * other server-only modules — see `paths.ts` for the filesystem helpers and zod
 * schemas.
 */

export const DRAFT_INFO_JSON_DISABLED_REASON =
  'Question metadata (info.json) cannot be modified inside the draft editor.';

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
 * file upload, or `null` if uploading is allowed. Assumes `filePath` is a
 * normalized POSIX path relative to the question root.
 */
export function getReservedDraftUploadReason(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (trimmed === 'info.json') return DRAFT_INFO_JSON_DISABLED_REASON;
  if (trimmed === 'question.html' || trimmed === 'server.py') {
    return `${trimmed} must be edited from the Files tab.`;
  }
  return null;
}
