import JSZip from 'jszip';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { PrintRenderer } from '../../lib/printing/print-renderer.js';
import { getPrintableInstanceQuestionIds } from '../../lib/printing.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';
import { downloadPrintableWord, waitForPrintablePage } from './utils/printing.js';

const cloudflareAccountId = process.env.CF_ACCOUNT_ID;
const cloudflareApiToken = process.env.CF_API_TOKEN;
const test = createTest(
  cloudflareAccountId && cloudflareApiToken
    ? {
        features: { 'printable-exams': true },
        printingCloudflareAccountId: cloudflareAccountId,
        printingCloudflareApiToken: cloudflareApiToken,
      }
    : { features: { 'printable-exams': true } },
);

test.describe.configure({ timeout: 180_000 });

test('serves completed pages and builds an editable Word document in the rendering browser', async ({
  page,
  courseInstance,
}) => {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const paperUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}/paper`;
  const response = await page.goto(`${paperUrl}/preview?paper_size=Letter`);
  expect(response?.ok()).toBe(true);
  await waitForPrintablePage(page);
  await expect(page.locator('.pagedjs_page')).toHaveCount(2);
  expect(await page.locator('script:not([type="application/json"])').count()).toBe(0);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'none'");
  const source = await page.locator('#pl-print-docx-source').textContent();
  expect(JSON.parse(source!).html).toContain('printing-question');

  const word = await downloadPrintableWord(page, paperUrl, 'paper_size=Letter');
  expect(word.ok(), word.ok() ? undefined : await word.text()).toBe(true);
  const archive = await JSZip.loadAsync(await word.body());
  const documentXml = await archive.file('word/document.xml')!.async('string');
  expect(documentXml).toContain('Consider two numbers');
  expect(documentXml).toContain('m:oMath');

  const renderer = new PrintRenderer({
    maxConcurrentRenders: 4,
    cloudflare:
      cloudflareAccountId && cloudflareApiToken
        ? { accountId: cloudflareAccountId, apiToken: cloudflareApiToken }
        : undefined,
  });
  try {
    const html = await page.content();
    const assetScope = {
      courseInstanceId: courseInstance.id,
      assessmentId: assessment.id,
      assessmentInstanceId,
      instanceQuestionIds: await getPrintableInstanceQuestionIds(assessmentInstanceId, new Set()),
      authnUserId: user.id,
      userId: user.id,
    };
    const pdfs = await Promise.all(
      Array.from({ length: 4 }, () => renderer.renderPdf({ url: page.url(), html, assetScope })),
    );
    for (const pdf of pdfs) {
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    }

    const color = await renderer.render(
      {
        url: page.url(),
        html: `<!doctype html><html data-print-status="ready"><head><link rel="stylesheet" href="/pl/course_instance/${courseInstance.id}/instructor/clientFilesCourse/sharedElementStyles.css"></head><body><span class="example-shared-style">Print asset</span></body></html>`,
        assetScope,
      },
      {
        label: 'print asset',
        produce: async (renderedPage) =>
          await renderedPage
            .locator('.example-shared-style')
            .evaluate((element) => getComputedStyle(element).getPropertyValue('color')),
      },
    );
    expect(color).toBe('rgb(255, 0, 0)');
  } finally {
    await renderer.close();
  }
});
