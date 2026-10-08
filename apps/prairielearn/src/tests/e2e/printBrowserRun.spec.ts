import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { PrintRenderer } from '../../lib/printing/printRenderer.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';
import { downloadPrintableWord, waitForPrintablePage } from './utils/printing.js';

const cloudflareAccountId = process.env.CF_ACCOUNT_ID;
const cloudflareApiToken = process.env.CF_API_TOKEN;
const test = createTest(
  cloudflareAccountId && cloudflareApiToken
    ? {
        printingCloudflareAccountId: cloudflareAccountId,
        printingCloudflareApiToken: cloudflareApiToken,
      }
    : undefined,
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
    const cookies = await page.context().cookies(page.url());
    const html = await page.content();
    const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
    const pdfs = await Promise.all(
      Array.from({ length: 4 }, () => renderer.renderPdf({ url: page.url(), html, cookieHeader })),
    );
    for (const pdf of pdfs) {
      expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
    }
  } finally {
    await renderer.close();
  }
});
