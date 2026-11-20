import type { Page } from '@playwright/test';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { selectAssessmentByTid } from '../../../models/assessment.js';
import { selectOptionalPrintForm } from '../../../models/print-form.js';
import { createTest, expect } from '../fixtures.js';

const sql = loadSqlEquiv(import.meta.url);
export const test = createTest({ features: { 'printable-assessments': true } });
export const viewer = {
  uid: 'print-viewer@example.com',
  name: 'Print viewer',
  uin: 'print-viewer',
  email: 'print-viewer@example.com',
};
export const viewerTest = createTest({
  features: { 'printable-assessments': true },
  authUid: viewer.uid,
  authName: viewer.name,
  authUin: viewer.uin,
  authEmail: viewer.email,
});
export const ACTIVE_PREVIEW_FRAME_SELECTOR =
  '.print-preparation-preview[data-active="true"] iframe[title="Printable document preview"]';

/** Each test starts without print forms or exports for the course instance. */
export async function clearPrintPreparationState(courseInstanceId: string) {
  await execute(sql.clear_print_exports, { course_instance_id: courseInstanceId });
  await execute(sql.clear_print_forms, { course_instance_id: courseInstanceId });
}

/** The download menu gates every export, so its toggle stands in for "ready to download". */
export function downloadMenu(page: Page) {
  return page.getByRole('button', { name: 'Download…', exact: true });
}

export async function chooseDownload(page: Page, item: string) {
  await downloadMenu(page).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}

export async function downloadPreparedFile(
  page: Page,
  submit: () => Promise<void>,
  format: 'pdf' | 'docx' = 'pdf',
) {
  const downloaded = page.waitForEvent('download', { timeout: 120_000 });
  const submitted = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return (
      response.request().method() === 'POST' &&
      (format === 'pdf'
        ? path.endsWith('/printExports.pdf')
        : /\/print_form\/\d+\/docx$/.test(path))
    );
  });
  await submit();
  const response = await submitted;
  expect(response.status()).toBe(200);
  const body = await response.json();
  const { printExportId } = format === 'pdf' ? body.result.data.json : body;
  const link = page
    .getByRole('region', { name: 'Recent exports' })
    .locator(`a[href$="/exports/${printExportId}"]`);
  await expect(link).toHaveAttribute('href', new RegExp(`/exports/${printExportId}$`), {
    timeout: 120_000,
  });
  return await downloaded;
}

export async function assessmentFor(courseInstanceId: string, tid = 'exam20-assessmentTools') {
  return await selectAssessmentByTid({ course_instance_id: courseInstanceId, tid });
}

export async function openPrintPreparation(
  page: Page,
  courseInstanceId: string,
  tid = 'exam20-assessmentTools',
) {
  const assessment = await assessmentFor(courseInstanceId, tid);
  await page.goto(
    `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessment.id}/print`,
  );
  return assessment;
}

export async function waitForFormA1(page: Page) {
  await expect(page.getByRole('button', { name: /^Form A1(?: Previewing)?$/ })).toBeVisible({
    timeout: 120_000,
  });
}

export async function preparePreview(page: Page) {
  await waitForFormA1(page);
  const applyPreview = page.getByRole('button', { name: /^(Create|Update) preview$/ });
  await expect
    .poll(async () => (await applyPreview.isEnabled()) || (await downloadMenu(page).isEnabled()), {
      timeout: 120_000,
    })
    .toBe(true);
  if (await applyPreview.isEnabled()) await applyPreview.click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
}

export async function printFormLabel(page: Page, printFormId?: string) {
  const url = new URL(page.url());
  const assessmentId = url.pathname.match(/\/assessment\/(\d+)\//)![1];
  const formId = printFormId ?? url.searchParams.get('form')!;
  const form = await selectOptionalPrintForm({ printFormId: formId, assessmentId });
  return form!.label;
}
