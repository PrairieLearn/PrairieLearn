import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

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

  const courseSharingSetsData = courseData.course.data?.sharingSets ?? [];

  await sqldb.execute(sql.sync_course_sharing_sets, {
    course_id: courseId,
    new_course_sharing_sets: JSON.stringify(courseSharingSetsData),
  });

  // Relies on `checkInvalidSharingSetDeletions` having gated the sync. With
  // `checkSharingOnSync` disabled, this can cascade-delete rows in
  // `sharing_set_questions` and `sharing_set_courses` via the ON DELETE CASCADE
  // foreign keys.
  await sqldb.execute(sql.delete_removed_course_sharing_sets, {
    course_id: courseId,
    sharing_set_names: courseSharingSetsData.map((ss) => ss.name),
  });

  const courseSharingSets = await sqldb.queryRows(
    sql.select_course_sharing_sets,
    { course_id: courseId },
    z.object({
      id: IdSchema,
      name: z.string(),
    }),
  );
  const sharingSetIdsByName: Record<string, string> = {};
  for (const sharingSet of courseSharingSets) {
    sharingSetIdsByName[sharingSet.name] = sharingSet.id;
  }

  const questionSharingSets: { question_id: string; sharing_set_id: string }[] = [];
  const syncedQuestionIds: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    syncedQuestionIds.push(questionIds[qid]);
    const dedupedQuestionSharingSetNames = new Set(question.data?.sharingSets);
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

  const serializedQuestionSharingSets = JSON.stringify(questionSharingSets);

  await sqldb.execute(sql.sync_question_sharing_sets, {
    new_question_sharing_sets: serializedQuestionSharingSets,
  });

  // Scoped to `syncedQuestionIds` so a transient error on a question's
  // info.json doesn't destructively wipe its existing sharing-set memberships.
  // Relies on `checkInvalidSharingSetRemovals` having gated the sync. With
  // `checkSharingOnSync` disabled, this can remove `sharing_set_questions`
  // rows for questions still used by other courses.
  await sqldb.execute(sql.delete_removed_question_sharing_sets, {
    course_id: courseId,
    synced_question_ids: syncedQuestionIds,
    new_question_sharing_sets: serializedQuestionSharingSets,
  });
}
