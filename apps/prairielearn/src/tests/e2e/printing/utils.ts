import type { Page } from '@playwright/test';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { printLayoutSearch } from '../../../lib/client/printing/print-preparation.js';
import { getAssessmentTrpcUrl, getPrintFormUrl } from '../../../lib/client/url.js';
import * as codeCaller from '../../../lib/code-caller/index.js';
import { config } from '../../../lib/config.js';
import type { CourseInstance, PrintForm } from '../../../lib/db-types.js';
import { createPrintForm } from '../../../lib/printing/print-forms.js';
import type { PrintSettings } from '../../../lib/printing/print-settings.js';
import { selectAssessmentByTid } from '../../../models/assessment.js';
import { selectCourseById } from '../../../models/course.js';
import { selectOptionalPrintForm, updatePrintFormSettings } from '../../../models/print-form.js';
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

/** Saves layout settings for a form and returns the preview search that its exports match. */
export async function savePrintSettings(printForm: PrintForm, settings: Partial<PrintSettings>) {
  const current = (await selectOptionalPrintForm({
    printFormId: printForm.id,
    assessmentId: printForm.assessment_id,
  }))!.settings;
  const updated = { ...current, ...settings };
  await updatePrintFormSettings({
    printFormId: printForm.id,
    assessmentId: printForm.assessment_id,
    settings: updated,
    expectedSettings: current,
  });
  return printLayoutSearch(updated);
}

/** Queues a Word export of the user's latest preview and returns its download. */
export async function downloadPrintableWord(
  page: Page,
  printUrl: string,
  printDocument: 'assessment' | 'answer_key' = 'assessment',
) {
  const { id: authnUserId } = await getConfiguredUser();
  const previewUrl = new URL(printUrl, page.url());
  const [, courseInstanceId, assessmentId, printFormId] = previewUrl.pathname.match(
    /^\/pl\/course_instance\/(\d+)\/instructor\/assessment\/(\d+)\/print_form\/(\d+)$/,
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
  const { printExportId } = await api.printExports.docx.mutate({
    printFormId,
    document: printDocument,
  });
  await expect
    .poll(
      async () => {
        const status = await api.printExports.status.query({ printExportId });
        return { status: status.status, failureMessage: status.failureMessage };
      },
      { timeout: 90_000 },
    )
    .toMatchObject({ status: 'succeeded' });
  const completed = await api.printExports.status.query({ printExportId });
  expect(completed.format).toBe('docx');
  return await page.request.get(completed.downloadUrl!);
}
