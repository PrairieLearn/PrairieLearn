import { selectAssessmentByTid } from '../../models/assessment.js';

import { createTest, expect } from './fixtures.js';

const missingBrowser = { PLAYWRIGHT_BROWSERS_PATH: '/private/tmp/pl-print-browser-unavailable' };

const test = createTest(undefined, missingBrowser);
test('hides Print when PDF rendering is unavailable', async ({ page, courseInstance }) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  const base = `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}`;
  await page.goto(`${base}/questions`);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);

  await page.goto(`${base}/print_preparation?instances=`);
  await expect(page.getByText('PDF downloads are not configured on this server.')).toBeVisible();
});
