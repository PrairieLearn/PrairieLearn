import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import {
  getPrintableFormQuestionIds,
  getPrintableQuestionListDigest,
} from '../../../lib/printing/index.js';
import { queuePrintExport } from '../../../lib/printing/print-exports.js';
import { checkPrintSnapshotId } from '../../../lib/printing/print-snapshot-id.js';
import { getConfiguredUser } from '../../utils/auth.js';
import { expect, test } from '../fixtures.js';

import { createPrintableForm } from './utils.js';

test('hides Print and blocks printable pages when the feature is disabled', async ({
  page,
  baseURL,
  courseInstance,
  enableFeatureFlag,
}) => {
  test.setTimeout(90_000);
  await enableFeatureFlag('printable-assessments');
  const { printForm, printUrl } = await createPrintableForm(
    courseInstance,
    'exam20-assessmentTools',
  );
  const assessmentBase = `/pl/course_instance/${courseInstance.id}/instructor/assessment/${printForm.assessment_id}`;
  const previewUrl = `${printUrl}/preview?paper_size=Letter`;
  const preview = await page.request.get(previewUrl);
  expect(preview.status()).toBe(200);
  const user = await getConfiguredUser();
  const html = await preview.text();
  const snapshotId = /data-print-snapshot-id="([^"]+)"/.exec(html)![1];
  const htmlDigest = checkPrintSnapshotId(
    {
      id: snapshotId,
      printFormId: printForm.id,
      authnUserId: user.id,
      search: new URL(previewUrl, baseURL).searchParams,
      questionListDigest: await getPrintableQuestionListDigest(printForm.id, new Set()),
    },
    config.secretKey,
  )!;
  const printExportId = await queuePrintExport({
    owner: {
      assessmentId: printForm.assessment_id,
      authnUserId: user.id,
      courseId: courseInstance.course_id,
      userId: user.id,
    },
    work: {
      format: 'pdf',
      document: 'assessment',
      copies: 1,
      filename: 'test-export.pdf',
      snapshots: [
        {
          formLabel: printForm.label,
          printDocument: 'assessment',
          localPreviewUrl: new URL(previewUrl, baseURL).href,
          html,
          htmlDigest,
          assetScope: {
            courseInstanceId: courseInstance.id,
            assessmentId: printForm.assessment_id,
            printFormId: printForm.id,
            printFormQuestionIds: await getPrintableFormQuestionIds(
              printForm.id,
              new Map(),
              new Set(),
            ),
            authnUserId: user.id,
            userId: user.id,
          },
        },
      ],
      covers: [],
    },
  });
  const exportUrl = `${assessmentBase}/print_preparation/exports/${printExportId}`;

  await expect
    .poll(async () => (await page.request.get(exportUrl)).status(), { timeout: 60_000 })
    .toBe(200);

  await features.disable('printable-assessments');

  await page.goto(`${assessmentBase}/questions`);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);

  expect((await page.request.get(`${assessmentBase}/print_preparation`)).status()).toBe(404);
  expect((await page.request.get(exportUrl)).status()).toBe(404);
  expect((await page.request.get(previewUrl)).status()).toBe(404);
});
