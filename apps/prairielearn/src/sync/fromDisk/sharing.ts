import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';
const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function sync(
  courseId: string,
  courseData: CourseData,
  questionIds: Record<string, any>,
) {
  if (infofile.hasErrors(courseData.course)) {
    return;
  }

  await sqldb.queryAsync(sql.sync_course_sharing_sets, {
    course_id: courseId,
    new_course_sharing_sets: JSON.stringify(courseData.course.data?.sharingSets ?? []),
  });

  const courseSharingSets = await sqldb.queryRows(
    sql.select_course_sharing_sets,
    { course_id: courseId },
    z.object({
      id: IdSchema,
      name: z.string(),
    }),
  );
  const sharingSetIdsByName = {};
  for (const sharingSet of courseSharingSets) {
    sharingSetIdsByName[sharingSet.name] = sharingSet.id;
  }

  const questionSharingSets: { question_id: string; sharing_set_id: string }[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionSharingSetNames = new Set(question.data?.sharingSets ?? []);
    const questionSharingSetIds = [...dedupedQuestionSharingSetNames].map(
      (sharingSet) => sharingSetIdsByName[sharingSet],
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
