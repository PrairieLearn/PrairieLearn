import { features } from '../../../lib/features/index.js';
import { expect, test } from '../fixtures.js';

import { createPrintableForm, downloadPrintableWord, waitForPrintablePage } from './utils.js';

test('hides Print and blocks printable pages when the feature is disabled', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(90_000);
  await features.enable('printable-assessments');
  try {
    const { printForm, printUrl } = await createPrintableForm(
      courseInstance,
      'exam20-assessmentTools',
    );
    const assessmentBase = `/pl/course_instance/${courseInstance.id}/instructor/assessment/${printForm.assessment_id}`;
    const search = 'paper_size=Letter&form_label=A';
    const previewUrl = `${printUrl}/preview?${search}`;
    await page.goto(previewUrl);
    await waitForPrintablePage(page);
    const download = await downloadPrintableWord(page, printUrl, search);
    expect(download.status()).toBe(200);
    const exportUrl = new URL(download.url()).pathname;

    await features.disable('printable-assessments');

    await page.goto(`${assessmentBase}/questions`);
    await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);

    expect((await page.request.get(`${assessmentBase}/print`)).status()).toBe(404);
    expect((await page.request.get(exportUrl)).status()).toBe(404);
    expect((await page.request.get(previewUrl)).status()).toBe(404);
  } finally {
    // A database grant outranks the config overrides other printing tests on this worker use.
    await features.delete('printable-assessments');
  }
});
