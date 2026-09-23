import { readQrCode } from '@prairielearn/qr-code';

import { deleteAssessmentInstance } from '../../lib/assessment.js';
import { decodePrintPageIdentity } from '../../lib/client/print-page-code.js';
import type { User } from '../../lib/db-types.js';
import { createPrintPreparationAssessmentInstance } from '../../lib/print-preparation.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getConfiguredUser } from '../utils/auth.js';

import { test as base, expect } from './fixtures.js';
import { waitForPrintablePage } from './utils/printing.js';

const test = base.extend<{
  printInstance: { instanceId: string; assessmentId: string; user: User };
}>({
  printInstance: async ({ courseInstance }, use) => {
    const user = await getConfiguredUser();
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'exam20-assessmentTools',
    });
    const instanceId = await createPrintPreparationAssessmentInstance({
      assessmentId: assessment.id,
      userId: user.id,
      authnUserId: user.id,
    });
    try {
      await use({ instanceId, assessmentId: assessment.id, user });
    } finally {
      await deleteAssessmentInstance(assessment.id, instanceId, user.id);
    }
  },
});

for (const [paperSize, document] of [
  ['Letter', 'exam'],
  ['A4', 'answer_key'],
] as const) {
  test(`previews scannable page codes for the ${paperSize} ${document}`, async ({
    page,
    courseInstance,
    printInstance: { instanceId, assessmentId, user },
  }) => {
    test.setTimeout(120_000);
    const response = await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${instanceId}/paper/preview?paper_size=${paperSize}&document=${document}&block_size=full`,
    );
    expect(response!.ok()).toBe(true);
    await waitForPrintablePage(page);
    const pageCount = Number(await page.locator(':root').getAttribute('data-print-page-count'));
    expect(pageCount).toBeGreaterThan(1);
    const codes = page.getByRole('img', { name: /^Page \d+ identification code$/ });
    await expect(codes).toHaveCount(pageCount);
    const previewIdentity = decodePrintPageIdentity(
      (await page.locator(':root').getAttribute('data-print-page-identity'))!,
    );
    expect(previewIdentity).toMatchObject({
      courseId: courseInstance.course_id,
      assessmentId,
      assessmentInstanceId: instanceId,
      generatedBy: { userId: user.id, uid: user.uid, name: user.name },
      document,
      format: 'pdf',
    });

    for (let index = 0; index < pageCount; index++) {
      const code = page.getByRole('img', {
        name: `Page ${index + 1} identification code`,
        exact: true,
      });
      await expect(code).toBeVisible();
      const { pixels, width, height, withinFooter } = await code.evaluate((element) => {
        const image = element as HTMLImageElement;
        const canvas = window.document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const context = canvas.getContext('2d')!;
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const bounds = image.getBoundingClientRect();
        const sheet = image.closest('.pagedjs_page')!;
        const sheetBounds = sheet.getBoundingClientRect();
        const contentBounds = sheet.querySelector('.pagedjs_area')!.getBoundingClientRect();
        return {
          pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
          width: canvas.width,
          height: canvas.height,
          withinFooter:
            bounds.top >= contentBounds.bottom &&
            bounds.bottom <= sheetBounds.bottom &&
            bounds.left >= sheetBounds.left &&
            bounds.right <= sheetBounds.right,
        };
      });
      expect(withinFooter).toBe(true);
      const decoded = readQrCode(new Uint8ClampedArray(pixels), width, height);
      expect(decoded).not.toBeNull();
      expect(decodePrintPageIdentity(decoded!.text)).toEqual({
        ...previewIdentity,
        pageNumber: index + 1,
      });
    }
  });
}
