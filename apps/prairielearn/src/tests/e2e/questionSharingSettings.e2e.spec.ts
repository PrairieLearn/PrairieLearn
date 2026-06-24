import { selectCourseByShortName } from '../../models/course.js';
import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ features: { 'question-sharing': true } });

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
