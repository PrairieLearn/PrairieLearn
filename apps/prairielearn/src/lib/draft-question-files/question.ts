import { selectOptionalQuestionById } from '../../models/question.js';
import type { Question } from '../db-types.js';
import { idsEqual } from '../id.js';

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

/**
 * Resolves a question id and classifies it for the draft editor. Both the
 * Express page and the `aiDraftFiles` tRPC router use this so their notion of a
 * valid draft question can never drift apart.
 */
export async function classifyDraftQuestion({
  questionId,
  courseId,
}: {
  questionId: string;
  courseId: string;
}): Promise<ClassifiedDraftQuestion> {
  const question = await selectOptionalQuestionById(questionId);
  if (question == null || !idsEqual(question.course_id, courseId) || question.deleted_at != null) {
    return { kind: 'not-found' };
  }
  if (!question.draft) {
    return { kind: 'finalized', question };
  }
  if (question.qid == null) {
    return { kind: 'not-found' };
  }
  return { kind: 'draft', question: { ...question, qid: question.qid } };
}
