import { selectCourseByShortName } from '../../models/course.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

test.describe('Questions table search', () => {
  let courseId: string;

  test.beforeAll(async ({ testCoursePath }) => {
    await syncCourse(testCoursePath);
    const course = await selectCourseByShortName('QA 101');
    courseId = course.id;
  });

  test('fuzzy search matches with typo', async ({ page }) => {
    await page.goto(`/pl/course/${courseId}/course_admin/questions`);

    await page.getByPlaceholder('Search by QID, title...').fill('adNumbres');

    await expect(page.getByRole('link', { name: /addNumbers/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /differentiatePolynomial/ })).toBeHidden();
  });
});
