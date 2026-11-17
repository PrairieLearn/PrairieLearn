import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectCourseByShortName } from '../../models/course.js';
import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ features: { 'question-sharing': true } });
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function addSharedQuestionUsageInOtherCourse({
  questionId,
  testCourseId,
  testCoursePath,
}: {
  questionId: string;
  testCourseId: string;
  testCoursePath: string;
}) {
  const consumingCourseId = await sqldb.queryScalar(
    sql.insert_consuming_course,
    { path: `${testCoursePath}-consuming` },
    IdSchema,
  );
  const sharingSetId = await sqldb.queryScalar(
    sql.share_final_exam_set_with_consuming_course,
    {
      consuming_course_id: consumingCourseId,
      test_course_id: testCourseId,
    },
    IdSchema,
  );
  const questionIsInSharingSet = await sqldb.queryScalar(
    sql.select_question_is_in_sharing_set,
    { question_id: questionId, sharing_set_id: sharingSetId },
    z.boolean(),
  );
  expect(questionIsInSharingSet).toBe(true);
  const courseInstanceId = await sqldb.queryScalar(
    sql.insert_consuming_course_instance,
    { course_id: consumingCourseId },
    IdSchema,
  );
  const assessmentId = await sqldb.queryScalar(
    sql.insert_consuming_assessment,
    { course_instance_id: courseInstanceId },
    IdSchema,
  );
  await sqldb.execute(sql.insert_consuming_assessment_question, {
    assessment_id: assessmentId,
    question_id: questionId,
  });

  const usedInOtherCourse = await sqldb.queryScalar(
    sql.select_question_used_in_other_course,
    { question_id: questionId, test_course_id: testCourseId },
    z.boolean(),
  );
  expect(usedInOtherCourse).toBe(true);
}

test('preserves question sharing state through hydration', async ({
  page,
  testCoursePath,
  enableFeatureFlag,
}) => {
  await enableFeatureFlag('question-sharing');
  await syncCourse(testCoursePath);

  const course = await selectCourseByShortName('QA 101');
  const question = await selectQuestionByQid({
    qid: 'partialCredit1',
    course_id: course.id,
  });
  await page.goto(`/pl/course/${course.id}/question/${question.id}/settings`);

  const sharePubliclyCheckbox = page.getByLabel('Share publicly');
  const shareSourcePubliclyCheckbox = page.getByLabel('Share source publicly');

  await expect(sharePubliclyCheckbox).not.toBeChecked();
  await expect(sharePubliclyCheckbox).toBeEnabled();
  await expect(shareSourcePubliclyCheckbox).toBeChecked();
  await expect(shareSourcePubliclyCheckbox).toBeDisabled();

  await sharePubliclyCheckbox.check();

  await expect(sharePubliclyCheckbox).toBeChecked();
  await expect(sharePubliclyCheckbox).toBeEnabled();
  await expect(shareSourcePubliclyCheckbox).toBeChecked();
  await expect(shareSourcePubliclyCheckbox).toBeEnabled();

  await sharePubliclyCheckbox.uncheck();

  await expect(sharePubliclyCheckbox).not.toBeChecked();
  await expect(sharePubliclyCheckbox).toBeEnabled();
  await expect(shareSourcePubliclyCheckbox).toBeChecked();
  await expect(shareSourcePubliclyCheckbox).toBeDisabled();
});

test('allows newly sharing a question publicly when it is used through a sharing set', async ({
  page,
  testCoursePath,
  enableFeatureFlag,
}) => {
  await enableFeatureFlag('question-sharing');
  await syncCourse(testCoursePath);

  const course = await selectCourseByShortName('QA 101');
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: course.id,
  });
  await addSharedQuestionUsageInOtherCourse({
    questionId: question.id,
    testCourseId: course.id,
    testCoursePath,
  });

  await page.goto(`/pl/course/${course.id}/question/${question.id}/settings`);

  const sharePubliclyCheckbox = page.getByLabel('Share publicly');

  await expect(sharePubliclyCheckbox).not.toBeChecked();
  await expect(sharePubliclyCheckbox).toBeEnabled();

  await sharePubliclyCheckbox.check();

  await expect(sharePubliclyCheckbox).toBeChecked();
  await expect(sharePubliclyCheckbox).toBeEnabled();
  await expect(
    page.getByText('This question is publicly shared and used by another course'),
  ).toHaveCount(0);
});
