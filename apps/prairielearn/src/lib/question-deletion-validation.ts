import { selectQuestionsUsedInOtherCourses } from '../models/question.js';

import { type Course, type Question } from './db-types.js';

/** Derives the set of QIDs to remove from assessment files when `questions` are deleted. */
export function qidsToRemoveForQuestions(questions: Pick<Question, 'qid'>[]): Set<string> {
  return new Set(questions.flatMap((question) => (question.qid ? [question.qid] : [])));
}

/**
 * Returns the selected questions that are referenced by *other* courses'
 * assessments and therefore cannot be deleted. Assessments within this course
 * are repaired automatically when their questions are deleted (emptied zones
 * are dropped and lockpoints relocated), so they never block deletion.
 *
 * `checkOtherCourses` lets callers skip the cross-course check when sharing
 * isn't validated at sync time (see `deleteQuestions` in
 * `trpc/course/questions.ts`).
 */
export async function selectQuestionsBlockingDeletion({
  course,
  questions,
  checkOtherCourses = true,
}: {
  course: Pick<Course, 'id'>;
  questions: Pick<Question, 'id' | 'qid'>[];
  checkOtherCourses?: boolean;
}): Promise<{ id: string; qid: string }[]> {
  if (!checkOtherCourses) return [];
  return selectQuestionsUsedInOtherCourses({
    question_ids: questions.map((question) => question.id),
    course_id: course.id,
  });
}
