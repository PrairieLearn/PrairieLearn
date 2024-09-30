import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';
const sql = sqldb.loadSqlEquiv(import.meta.url);

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

  const newSharingSets = await sqldb.callRow(
    'sync_course_sharing_sets',
    [!infofile.hasErrors(courseData.course), courseSharingSets, courseId],
    z.array(z.tuple([z.string(), IdSchema])),
  );

  const sharingSetIdsByName = new Map(newSharingSets);

  const questionSharingSets: { question_id: string; sharing_set_id: string }[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionSharingSetNames = new Set(question.data?.sharingSets ?? []);
    const questionSharingSetIds = [...dedupedQuestionSharingSetNames].map((t) =>
      sharingSetIdsByName.get(t),
    );
    questionSharingSetIds.forEach((sharingSetId) => {
      questionSharingSets.push({
        question_id: questionIds[qid],
        sharing_set_id: sharingSetId,
      });
    });
  });

  await sqldb.queryAsync(sql.sync_question_sharing_sets, {
    new_question_sharing_sets: JSON.stringify(questionSharingSets),
  });
}
