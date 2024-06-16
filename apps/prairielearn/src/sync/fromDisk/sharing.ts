import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';
import { makePerformance } from '../performance.js';

const perf = makePerformance('sharing_sets');

export async function sync(
  courseId: string,
  courseData: CourseData,
  questionIds: Record<string, any>,
) {
  let courseSharingSets: string[] = [];
  if (!infofile.hasErrors(courseData.course)) {
    courseSharingSets = (courseData.course.data?.sharingSets ?? []).map((s) =>
      JSON.stringify([s.name, s.description]),
    );
  }

  perf.start('sproc:sync_course_tags');
  const newSharingSets = await sqldb.callRow(
    'sync_course_tags',
    [!infofile.hasErrors(courseData.course), courseSharingSets, courseId],
    z.array(z.tuple([z.string(), IdSchema])),
  );
  perf.end('sproc:sync_course_tags');

  const tagIdsByName = new Map(newSharingSets);

  const questionSharingSetsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionSharingSetNames = new Set<string>();
    (question.data?.sharingSets ?? []).forEach((t) => dedupedQuestionSharingSetNames.add(t));
    const questionSharingSetIds = [...dedupedQuestionSharingSetNames].map((t) =>
      tagIdsByName.get(t),
    );
    questionSharingSetsParam.push(JSON.stringify([questionIds[qid], questionSharingSetIds]));
  });

  perf.start('sproc:sync_question_tags');
  await sqldb.callAsync('sync_question_tags', [questionSharingSetsParam]);
  perf.end('sproc:sync_question_tags');
}
