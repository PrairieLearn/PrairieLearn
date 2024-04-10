import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';

import * as infofile from '../infofile';
import { makePerformance } from '../performance';
import { CourseData } from '../course-db';
import { IdSchema } from '../../lib/db-types';

const perf = makePerformance('tags');

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

  perf.start('sproc:sync_course_tags');
  const newTags = await sqldb.callRow(
    'sync_course_tags',
    [!infofile.hasErrors(courseData.course), deleteUnused, courseTags, questionTagNames, courseId],
    z.array(z.tuple([z.string(), IdSchema])),
  );
  perf.end('sproc:sync_course_tags');

  const tagIdsByName = new Map(newTags);

  const questionTagsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionTagNames = new Set<string>();
    (question.data?.tags ?? []).forEach((t) => dedupedQuestionTagNames.add(t));
    const questionTagIds = [...dedupedQuestionTagNames].map((t) => tagIdsByName.get(t));
    questionTagsParam.push(JSON.stringify([questionIds[qid], questionTagIds]));
  });

  perf.start('sproc:sync_question_tags');
  await sqldb.callAsync('sync_question_tags', [questionTagsParam]);
  perf.end('sproc:sync_question_tags');
}
