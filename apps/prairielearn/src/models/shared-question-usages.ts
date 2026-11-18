import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import type { Question } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** Record usage after inserting the submission, in the same transaction. */
export async function insertSharedQuestionUsagesForSubmission({
  question,
  course_id,
  assessment_instance_id,
}: {
  question: Pick<Question, 'copied_from_question_id'>;
  course_id: string;
  assessment_instance_id: string | null;
}) {
  if (question.copied_from_question_id == null || assessment_instance_id == null) return;

  await execute(sql.insert_shared_question_usages, {
    copied_from_question_id: question.copied_from_question_id,
    destination_course_id: course_id,
    assessment_instance_id,
  });
}
