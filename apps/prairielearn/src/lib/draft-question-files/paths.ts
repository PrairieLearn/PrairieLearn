import * as path from 'node:path';

import { z } from 'zod';

import type { Question } from '../db-types.js';

/**
 * Reason shown when a draft question's `info.json` is targeted by a file
 * operation. Draft metadata is managed by the draft editor, so `info.json` can
 * only be edited directly once the question is finalized.
 */
export const DRAFT_INFO_JSON_DISABLED_REASON =
  'Draft question metadata is managed by the draft editor. Only finalized questions can edit info.json directly.';

/** Whether a question-relative path targets the draft question's `info.json`. */
export function isDraftQuestionInfoFile(filePath: string): boolean {
  return path.posix.normalize(filePath) === 'info.json';
}

/** Trims and normalizes a path with POSIX separators. */
function normalizeRelativePath(value: string): string {
  return path.posix.normalize(value.trim());
}

/**
 * Whether `value` is a path that stays within the question directory: non-empty,
 * free of null bytes and backslashes, and not escaping the root via `..` or an
 * absolute path.
 */
function isValidRelativePath(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.includes('\0') || trimmed.includes('\\')) return false;

  const normalized = path.posix.normalize(trimmed);
  return (
    normalized !== '.' &&
    normalized !== '..' &&
    !normalized.startsWith('../') &&
    !path.posix.isAbsolute(normalized)
  );
}

/**
 * A path to a file within a draft question's directory. Parses to the trimmed,
 * normalized POSIX path; rejects empty paths and directory traversal.
 */
export const QuestionRelativeFilePathSchema = z
  .string()
  .refine(isValidRelativePath, { message: 'Invalid file path' })
  .transform(normalizeRelativePath);

/**
 * Like {@link QuestionRelativeFilePathSchema}, but additionally rejects the
 * draft question's `info.json`. Use this for file mutations and any input that
 * must not target draft metadata.
 */
export const ModifiableQuestionFilePathSchema = QuestionRelativeFilePathSchema.refine(
  (filePath) => !isDraftQuestionInfoFile(filePath),
  { message: DRAFT_INFO_JSON_DISABLED_REASON },
);

/**
 * A path to a directory within a draft question. The question root (empty
 * string or `.`) parses to `null`.
 */
export const QuestionRelativeDirectorySchema = z
  .string()
  .refine(
    (value) => {
      const trimmed = value.trim();
      return trimmed === '' || trimmed === '.' || isValidRelativePath(value);
    },
    { message: 'Invalid directory path' },
  )
  .transform((value): string | null => {
    const trimmed = value.trim();
    return trimmed === '' || trimmed === '.' ? null : normalizeRelativePath(value);
  });

/**
 * Returns a draft question's QID. Drafts always have one; a missing QID is an
 * invariant violation, not a user-facing error.
 */
export function requireQuestionQid(question: Pick<Question, 'qid'>): string {
  if (!question.qid) {
    throw new Error('Draft question is missing a QID');
  }
  return question.qid;
}

/** Absolute path to a question's directory within its course. */
export function getQuestionRootPath(coursePath: string, qid: string): string {
  return path.resolve(coursePath, 'questions', qid);
}

/**
 * Resolves a question-relative path against the question root, asserting the
 * result stays within it. The path schemas already reject traversal; this is a
 * defense-in-depth guard against a filesystem access outside the root.
 */
export function resolveWithinQuestionRoot(questionRootPath: string, relativePath: string): string {
  const fullPath = path.resolve(questionRootPath, relativePath);
  if (fullPath !== questionRootPath && !fullPath.startsWith(`${questionRootPath}${path.sep}`)) {
    throw new Error(`Resolved path escapes the question directory: ${relativePath}`);
  }
  return fullPath;
}
