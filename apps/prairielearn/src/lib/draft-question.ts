import type { Course, Question } from './db-types.js';
import { idsEqual } from './id.js';

export const DRAFT_QID_PREFIX = '__drafts__/';

export function isDraftQid(qid: string): boolean {
  return qid.startsWith(DRAFT_QID_PREFIX);
}

/** A draft question, guaranteed to have a QID. */
type DraftQuestion = Question & { qid: string };

/**
 * The result of resolving a question id for the draft editor:
 * - `draft`: a non-deleted draft question in this course with a QID.
 * - `finalized`: a non-deleted, non-draft question in this course — the user
 *   most likely navigated back after finalizing it.
 * - `not-found`: anything else (missing, deleted, in another course).
 */
type ClassifiedDraftQuestion =
  | { kind: 'draft'; question: DraftQuestion }
  | { kind: 'finalized'; question: Question }
  | { kind: 'not-found' };

export function classifyDraftQuestion(
  course: Course,
  question: Question | null,
): ClassifiedDraftQuestion {
  if (question == null || question.deleted_at != null || !idsEqual(question.course_id, course.id)) {
    return { kind: 'not-found' };
  }
  if (!question.draft) {
    return { kind: 'finalized', question };
  }
  if (question.qid == null) {
    return { kind: 'not-found' };
  }
  return { kind: 'draft', question: question as DraftQuestion };
}
