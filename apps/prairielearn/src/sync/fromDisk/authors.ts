import * as sqldb from '@prairielearn/postgres';

import { CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

export async function sync(
  courseId: string,
  courseData: CourseData,
  questionIds: Record<string, any>,
) {
  const questionAuthorsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;

    if (question.data?.authors) {
      questionAuthorsParam.push(JSON.stringify([questionIds[qid], question.data.authors])); // TODO: map authors onto IDs instead?
    }
  });

  await sqldb.callAsync('sync_question_authors', [questionAuthorsParam]);
}
