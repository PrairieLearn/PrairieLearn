import { randomUUID } from 'node:crypto';

import { deleteFromS3, uploadToS3 } from '../../../lib/aws.js';
import { features } from '../../../lib/features/index.js';
import { getFileStoreS3Bucket } from '../../../lib/file-store.js';
import { finishPrintExport, insertPrintExport } from '../../../models/print-export.js';
import { getConfiguredUser } from '../../utils/auth.js';
import { expect, test } from '../fixtures.js';

import { createPrintableForm } from './utils.js';

test('hides Print and blocks printable pages when the feature is disabled', async ({
  page,
  courseInstance,
}) => {
  await features.enable('printable-assessments');
  let outputKey: string | null = null;
  try {
    const { printForm, printUrl } = await createPrintableForm(
      courseInstance,
      'exam17-mixedRealTimeGrading',
    );
    const assessmentBase = `/pl/course_instance/${courseInstance.id}/instructor/assessment/${printForm.assessment_id}`;
    const previewUrl = `${printUrl}/preview?paper_size=Letter`;
    const preview = await page.request.get(previewUrl);
    expect(preview.status()).toBe(200);
    const user = await getConfiguredUser();
    const printExportId = await insertPrintExport({
      assessmentId: printForm.assessment_id,
      userId: user.id,
      authnUserId: user.id,
      format: 'pdf',
      filename: 'test-export.pdf',
      label: 'Form A PDF',
      inputKey: 'unused',
    });
    outputKey = `print-exports/test-${randomUUID()}/output.pdf`;
    const contents = Buffer.from('%PDF-1.4\n');
    await uploadToS3(getFileStoreS3Bucket(), outputKey, null, false, contents);
    await finishPrintExport(printExportId, {
      status: 'succeeded',
      outputKey,
      sizeBytes: contents.length,
    });
    const exportUrl = `${assessmentBase}/print/exports/${printExportId}`;

    expect((await page.request.get(exportUrl)).status()).toBe(200);

    await features.disable('printable-assessments');

    await page.goto(`${assessmentBase}/questions`);
    await expect(page.getByRole('link', { name: 'Print', exact: true })).toHaveCount(0);

    expect((await page.request.get(`${assessmentBase}/print`)).status()).toBe(404);
    expect((await page.request.get(exportUrl)).status()).toBe(404);
    expect((await page.request.get(previewUrl)).status()).toBe(404);
  } finally {
    // A database grant outranks the config overrides other printing tests on this worker use.
    await features.delete('printable-assessments');
    if (outputKey) await deleteFromS3(getFileStoreS3Bucket(), outputKey);
  }
});
