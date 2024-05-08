import * as sqldb from '@prairielearn/postgres';

import * as infofile from '../infofile';
import { makePerformance } from '../performance';
import { CourseData } from '../course-db';

const perf = makePerformance('authors');

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

  perf.start('sproc:sync_question_authors');
  await sqldb.callAsync('sync_question_authors', [questionAuthorsParam]);
  perf.end('sproc:sync_question_authors');
}
