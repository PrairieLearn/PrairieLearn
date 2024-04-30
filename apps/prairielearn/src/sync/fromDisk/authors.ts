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
    const dedupedQuestionTagNames = new Set<string>();
    (question.data?.tags ?? []).forEach((t) => dedupedQuestionTagNames.add(t));
    question.data?.authors.forEach((author) => {
      questionAuthorsParam.push(JSON.stringify([questionIds[qid], author]));
    });
  });

  if (questionAuthorsParam.length > 0) {
    console.log(questionAuthorsParam);
  }

  perf.start('sproc:sync_question_authors');
  await sqldb.callAsync('sync_question_authors', [questionAuthorsParam]);
  perf.end('sproc:sync_question_authors');
}
