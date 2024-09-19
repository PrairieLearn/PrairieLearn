import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

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

  // console.log('Sharing Sets for Course:', courseId);
  // console.log('course sharing sets', courseSharingSets);

  const newSharingSets = await sqldb.callRow(
    'sync_course_sharing_sets',
    [!infofile.hasErrors(courseData.course), courseSharingSets, courseId],
    z.array(z.tuple([z.string(), IdSchema])),
  );

  const sharingSetIdsByName = new Map(newSharingSets);

  const questionSharingSetsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionSharingSetNames = new Set<string>();
    (question.data?.sharingSets ?? []).forEach((t) => dedupedQuestionSharingSetNames.add(t));
    const questionSharingSetIds = [...dedupedQuestionSharingSetNames].map((t) =>
      sharingSetIdsByName.get(t),
    );
    questionSharingSetsParam.push(JSON.stringify([questionIds[qid], questionSharingSetIds]));
  });

  // console.log('question sharing sets', questionSharingSetsParam);

  await sqldb.callAsync('sync_question_sharing_sets', [questionSharingSetsParam]);
}
