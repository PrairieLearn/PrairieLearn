import type { Page } from '@playwright/test';

import { serializePrintDocument } from '../../../lib/client/print-document.js';
import { getPrintFormUrl } from '../../../lib/client/url.js';
import * as codeCaller from '../../../lib/code-caller/index.js';
import type { CourseInstance } from '../../../lib/db-types.js';
import { createPrintForm } from '../../../lib/print-forms.js';
import { generateCsrfToken } from '../../../middlewares/csrfToken.js';
import { selectAssessmentByTid } from '../../../models/assessment.js';
import { selectCourseById } from '../../../models/course.js';
import * as freeformServer from '../../../question-servers/freeform.js';
import { getConfiguredUser } from '../../utils/auth.js';
import { expect } from '../fixtures.js';

export async function createPrintableForm(courseInstance: CourseInstance, tid: string) {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({ course_instance_id: courseInstance.id, tid });
  const course = await selectCourseById(courseInstance.course_id);
  await freeformServer.init();
  await codeCaller.init({ lazyWorkers: true });
  let printForm;
  try {
    printForm = await createPrintForm({
      assessment,
      course,
      courseInstance,
      userId: user.id,
      authnUserId: user.id,
    });
  } finally {
    await codeCaller.finish();
  }
  return {
    printForm,
    printUrl: getPrintFormUrl({
      courseInstanceId: courseInstance.id,
      assessmentId: assessment.id,
      printFormId: printForm.id,
    }),
  };
}

export async function waitForPrintablePage(page: Page): Promise<void> {
  const root = page.locator(':root');
  await expect(root).toHaveAttribute('data-print-status', /^(ready|error)$/);
  const state = await root.evaluate((element) => ({
    status: element.dataset.printStatus,
    error: element.dataset.printError,
  }));
  expect(state).toEqual({ status: 'ready', error: undefined });
}

export async function downloadPrintableWord(page: Page, printUrl: string, search: string) {
  const source = await page.evaluate(() =>
    JSON.parse(document.getElementById('pl-print-docx-source')!.textContent),
  );
  const id = await page.locator(':root').getAttribute('data-print-snapshot-id');
  const html = await page.locator(':root').evaluate(serializePrintDocument);
  const { id: authnUserId } = await getConfiguredUser();
  return await page.request.post(`${printUrl}/docx?${search}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/octet-stream',
      'X-CSRF-Token': generateCsrfToken({ url: `${printUrl}/docx`, authnUserId }),
    },
    data: JSON.stringify({ id, html, source }),
    timeout: 30_000,
  });
}
