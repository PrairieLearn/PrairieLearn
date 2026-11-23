import type { Page } from '@playwright/test';
import { z } from 'zod';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { serializePrintDocument } from '../../../lib/client/printing/print-document.js';
import { getAssessmentTrpcUrl, getPrintFormUrl } from '../../../lib/client/url.js';
import * as codeCaller from '../../../lib/code-caller/index.js';
import { config } from '../../../lib/config.js';
import type { CourseInstance } from '../../../lib/db-types.js';
import { createPrintForm } from '../../../lib/printing/print-forms.js';
import { generateCsrfToken } from '../../../middlewares/csrfToken.js';
import { selectAssessmentByTid } from '../../../models/assessment.js';
import { selectCourseById } from '../../../models/course.js';
import * as freeformServer from '../../../question-servers/freeform.js';
import { createAssessmentTrpcClient } from '../../../trpc/assessment/client.js';
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
  const queued = await page.request.post(`${printUrl}/docx?${search}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/octet-stream',
      'X-CSRF-Token': generateCsrfToken({ url: `${printUrl}/docx`, authnUserId }),
    },
    data: JSON.stringify({ id, html, source }),
    timeout: 30_000,
  });
  if (!queued.ok()) return queued;
  expect(queued.headers()['content-type']).toContain('application/json');
  const { printExportId } = z.object({ printExportId: IdSchema }).parse(await queued.json());
  const previewUrl = new URL(printUrl, page.url());
  const [, courseInstanceId, assessmentId] = previewUrl.pathname.match(
    /^\/pl\/course_instance\/(\d+)\/instructor\/assessment\/(\d+)\/print_form\/\d+$/,
  )!;
  const api = createAssessmentTrpcClient({
    courseInstanceId,
    assessmentId,
    urlBase: previewUrl.origin,
    csrfToken: generatePrefixCsrfToken(
      { url: getAssessmentTrpcUrl({ courseInstanceId, assessmentId }), authn_user_id: authnUserId },
      config.secretKey,
    ),
  });
  await expect
    .poll(
      async () => {
        const status = await api.printableAssessmentExport.status.query({ printExportId });
        return { status: status.status, failureMessage: status.failureMessage };
      },
      { timeout: 90_000 },
    )
    .toMatchObject({ status: 'succeeded' });
  const completed = await api.printableAssessmentExport.status.query({ printExportId });
  expect(completed.format).toBe('docx');
  return await page.request.get(completed.downloadUrl!);
}
