import { makeAssessmentInstance } from '../../lib/assessment.js';
import { getPrintableInstanceQuestionIds } from '../../lib/printing/index.js';
import { PrintRenderer } from '../../lib/printing/print-renderer.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';
import { waitForPrintablePage } from './utils/printing.js';

const cloudflareAccountId = process.env.CF_ACCOUNT_ID;
const cloudflareApiToken = process.env.CF_API_TOKEN;
const test = createTest(
  cloudflareAccountId && cloudflareApiToken
    ? {
        features: { 'printable-assessments': true },
        printingCloudflareAccountId: cloudflareAccountId,
        printingCloudflareApiToken: cloudflareApiToken,
      }
    : { features: { 'printable-assessments': true } },
);

test.describe.configure({ timeout: 180_000 });

test('loads course assets in the rendering browser', async ({ page, courseInstance }) => {
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
  const printUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}/print`;
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
      assessmentId: assessment.id,
      assessmentInstanceId,
      instanceQuestionIds: await getPrintableInstanceQuestionIds(assessmentInstanceId, new Set()),
      authnUserId: user.id,
      userId: user.id,
    };
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
