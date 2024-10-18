import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

export async function sync(
  courseId: string,
  courseData: CourseData,
  questionIds: Record<string, any>,
) {
  // We can only safely remove unused tags if both `infoCourse.json` and all
  // question `info.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoQuestionsValid = Object.values(courseData.questions).every(
    (q) => !infofile.hasErrors(q),
  );
  const deleteUnused = isInfoCourseValid && areAllInfoQuestionsValid;

  let courseTags: string[] = [];
  if (!infofile.hasErrors(courseData.course)) {
    courseTags = (courseData.course.data?.tags ?? []).map((t) =>
      JSON.stringify([t.name, t.description, t.color]),
    );
  }

  const knownQuestionTagsNames = new Set<string>();
  Object.values(courseData.questions).forEach((q) => {
    if (!infofile.hasErrors(q)) {
      (q.data?.tags ?? []).forEach((t) => knownQuestionTagsNames.add(t));
    }
  });
  const questionTagNames = [...knownQuestionTagsNames];

  const newTags = await sqldb.callRow(
    'sync_course_tags',
    [!infofile.hasErrors(courseData.course), deleteUnused, courseTags, questionTagNames, courseId],
    z.array(z.tuple([z.string(), IdSchema])),
  );

  const tagIdsByName = new Map(newTags);

  const questionTagsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionTagNames = new Set<string>();
    (question.data?.tags ?? []).forEach((t) => dedupedQuestionTagNames.add(t));
    const questionTagIds = [...dedupedQuestionTagNames].map((t) => tagIdsByName.get(t));
    questionTagsParam.push(JSON.stringify([questionIds[qid], questionTagIds]));
  });

  await sqldb.callAsync('sync_question_tags', [questionTagsParam]);
}
