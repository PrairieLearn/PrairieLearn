import { getPrintableFormQuestionIds } from '../../../lib/printing/index.js';
import { PrintRenderer } from '../../../lib/printing/print-renderer.js';
import { getConfiguredUser } from '../../utils/auth.js';
import { createTest, expect } from '../fixtures.js';

import { createPrintableForm, waitForPrintablePage } from './utils.js';

const cloudflareAccountId = process.env.CF_ACCOUNT_ID;
const cloudflareApiToken = process.env.CF_API_TOKEN;
const browserOrigin = 'https://example.com';
const test = createTest({ features: { 'printable-assessments': true } });

test('loads course assets in the rendering browser', async ({ page, courseInstance }) => {
  const user = await getConfiguredUser();
  const { printForm, printUrl } = await createPrintableForm(
    courseInstance,
    'exam20-assessmentTools',
  );
  await page.goto(`${printUrl}/preview?paper_size=Letter`);
  await waitForPrintablePage(page);

  const renderer = new PrintRenderer({
    cloudflare:
      cloudflareAccountId && cloudflareApiToken
        ? { accountId: cloudflareAccountId, apiToken: cloudflareApiToken }
        : undefined,
  });
  try {
    const assetScope = {
      courseInstanceId: courseInstance.id,
      assessmentId: printForm.assessment_id,
      printFormId: printForm.id,
      printFormQuestionIds: await getPrintableFormQuestionIds(printForm.id, new Map(), new Set()),
      authnUserId: user.id,
      userId: user.id,
    };
    const color = await renderer.render(
      {
        url: page.url(),
        browserOrigin,
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
