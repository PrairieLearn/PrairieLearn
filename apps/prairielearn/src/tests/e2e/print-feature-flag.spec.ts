import { selectAssessmentByTid } from '../../models/assessment.js';

import { expect, test } from './fixtures.js';

test('hides Print and blocks printable pages when the feature is disabled', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  const base = `/pl/course_instance/${courseInstance.id}/instructor`;
  const assessmentBase = `${base}/assessment/${assessment.id}`;

  await page.goto(`${assessmentBase}/questions`);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);

  expect((await page.request.get(`${assessmentBase}/print_preparation`)).status()).toBe(404);
  expect(
    (await page.request.get(`${assessmentBase}/print_preparation/exports/1.pdf`)).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(`${base}/assessment_instance/1/paper/preview?paper_size=Letter`)
    ).status(),
  ).toBe(404);
});
