import { features } from '../../../lib/features/index.js';
import { storeCompletedPrintExport } from '../../../lib/print-export-jobs.js';
import { selectAssessmentByTid } from '../../../models/assessment.js';
import { getConfiguredUser } from '../../utils/auth.js';
import { expect, test } from '../fixtures.js';

import { createPrintableAssessmentInstance } from './utils.js';

test('hides Print and blocks printable pages when the feature is disabled', async ({
  page,
  baseURL,
  courseInstance,
  enableFeatureFlag,
}) => {
  await enableFeatureFlag('printable-assessments');
  const tid = 'exam20-assessmentTools';
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid,
  });
  const base = `/pl/course_instance/${courseInstance.id}/instructor`;
  const assessmentBase = `${base}/assessment/${assessment.id}`;
  const assessmentInstanceId = await createPrintableAssessmentInstance(courseInstance.id, tid);
  const previewUrl = `${base}/assessment_instance/${assessmentInstanceId}/print/preview?paper_size=Letter`;
  const user = await getConfiguredUser();
  const jobSequenceId = await storeCompletedPrintExport({
    owner: {
      assessmentId: assessment.id,
      authnUserId: user.id,
      courseId: courseInstance.course_id,
      courseInstanceId: courseInstance.id,
      userId: user.id,
    },
    packet: Buffer.from('%PDF-1.4\nfeature gate export\n'),
    work: {
      document: 'assessment',
      copies: 1,
      filename: 'test-export.pdf',
      snapshots: [
        {
          formLabel: 'A',
          printDocument: 'assessment',
          localPreviewUrl: new URL(previewUrl, baseURL).href,
          html: '',
          assetScope: {
            courseInstanceId: courseInstance.id,
            assessmentId: assessment.id,
            assessmentInstanceId,
            instanceQuestionIds: [],
            authnUserId: user.id,
            userId: user.id,
          },
        },
      ],
      covers: [],
    },
  });
  const exportUrl = `${assessmentBase}/print_preparation/exports/${jobSequenceId}.pdf`;

  expect((await page.request.get(previewUrl)).status()).toBe(200);
  expect((await page.request.get(exportUrl)).status()).toBe(200);

  await features.disable('printable-assessments');

  await page.goto(`${assessmentBase}/questions`);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);

  expect((await page.request.get(`${assessmentBase}/print_preparation`)).status()).toBe(404);
  expect((await page.request.get(exportUrl)).status()).toBe(404);
  expect((await page.request.get(previewUrl)).status()).toBe(404);
});
