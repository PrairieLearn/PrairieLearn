import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { normalizeQuestionAuthors } from '../../lib/question-authors.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = loadSqlEquiv(import.meta.url);

export async function sync(
  questions: CourseData['questions'],
  questionIds: Record<string, string>,
) {
  const incoming = Object.entries(questions)
    .filter(([, question]) => !infofile.hasErrors(question))
    .map(([qid, question]) => ({
      question_id: questionIds[qid],
      uids: normalizeQuestionAuthors(question.data?.authors ?? []).uids,
    }));
  await execute(sql.sync_question_author_uids, { incoming: JSON.stringify(incoming) });
}
