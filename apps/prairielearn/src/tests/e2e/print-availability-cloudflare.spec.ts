import { selectAssessmentByTid } from '../../models/assessment.js';

import { createTest, expect } from './fixtures.js';

const test = createTest(
  { printingCloudflareAccountId: 'account', printingCloudflareApiToken: 'token' },
  { PLAYWRIGHT_BROWSERS_PATH: '/private/tmp/pl-print-browser-unavailable' },
);

test('shows Print with Cloudflare configured and no local Chromium', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
});
