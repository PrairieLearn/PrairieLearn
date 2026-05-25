/**
 * Path helpers safe to bundle into the browser. Must not import `node:*` or
 * other server-only modules — see `paths.ts` for the filesystem helpers and zod
 * schemas.
 */

export const DRAFT_INFO_JSON_DISABLED_REASON =
  'Question metadata (info.json) cannot be modified inside the draft editor.';

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
