import fs from 'node:fs/promises';

import type { Page } from '@playwright/test';
import axe from 'axe-core';
import { PDFDocument } from 'pdf-lib';
import * as unzipper from 'unzipper';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';

import { selectAssessmentByTid } from '../../../models/assessment.js';
import { insertCoursePermissionsByUserUid } from '../../../models/course-permissions.js';
import { selectPrintFormQuestions } from '../../../models/print-form-question.js';
import {
  archivePrintForm,
  selectActivePrintFormsForAssessment,
  selectOptionalPrintForm,
} from '../../../models/print-form.js';
import { syncCourse } from '../../helperCourse.js';
import { getOrCreateUser } from '../../utils/auth.js';
import { createTest, expect } from '../fixtures.js';

const sql = loadSqlEquiv(import.meta.url);
const test = createTest({ features: { 'printable-assessments': true } });
const ACTIVE_PREVIEW_FRAME_SELECTOR =
  '.print-preparation-preview[data-active="true"] iframe[title="Printable document preview"]';

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ courseInstance }) => {
  await execute(sql.clear_print_exports, { course_instance_id: courseInstance.id });
  await execute(sql.clear_print_forms, { course_instance_id: courseInstance.id });
});

/** The download menu gates every export, so its toggle stands in for "ready to download". */
function downloadMenu(page: Page) {
  return page.getByRole('button', { name: 'Download…', exact: true });
}

async function chooseDownload(page: Page, item: string) {
  await downloadMenu(page).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}

async function downloadPreparedFile(
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
        ? path.endsWith('/printableAssessmentExport.pdf')
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

async function assessmentFor(courseInstanceId: string, tid = 'exam20-assessmentTools') {
  return await selectAssessmentByTid({ course_instance_id: courseInstanceId, tid });
}

async function openPrintPreparation(
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

async function waitForFormA(page: Page) {
  await expect(page.getByRole('button', { name: /^Form A(?:[2-9]|[1-9]\d+)?/ })).toBeVisible({
    timeout: 120_000,
  });
}

async function preparePreview(page: Page) {
  await waitForFormA(page);
  const applyPreview = page.getByRole('button', { name: /^(Create|Update) preview$/ });
  await expect
    .poll(async () => (await applyPreview.isEnabled()) || (await downloadMenu(page).isEnabled()), {
      timeout: 120_000,
    })
    .toBe(true);
  if (await applyPreview.isEnabled()) await applyPreview.click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
}

async function printFormLabel(page: Page, printFormId?: string) {
  const url = new URL(page.url());
  const assessmentId = url.pathname.match(/\/assessment\/(\d+)\//)![1];
  const formId = printFormId ?? url.searchParams.get('form')!;
  const form = await selectOptionalPrintForm({ printFormId: formId, assessmentId });
  return form!.label;
}

test('keeps an unsaved student-fields draft when another tab updates the shared form', async ({
  page,
  courseInstance,
}) => {
  const assessment = await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const otherTab = await page.context().newPage();
  await otherTab.goto(page.url());
  await expect(otherTab.getByLabel('Space per question')).toBeEnabled();

  await page.bringToFront();
  await page.getByLabel('Additional student fields:').fill('Section\nRoom');
  await otherTab.bringToFront();
  await otherTab.getByLabel('Space per question').selectOption('half');
  const printFormId = new URL(page.url()).searchParams.get('form')!;
  await expect
    .poll(
      async () =>
        (await selectOptionalPrintForm({ printFormId, assessmentId: assessment.id }))?.settings
          .blockSize,
    )
    .toBe('half');

  const formsRefreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith('/printForms.list'),
    { timeout: 15_000 },
  );
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await formsRefreshed;
  await expect(page.getByLabel('Additional student fields:')).toHaveValue('Section\nRoom');
  await expect(page.getByLabel('Space per question')).toHaveValue('half');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await selectOptionalPrintForm({ printFormId, assessmentId: assessment.id }))?.settings
          .identityFields,
    )
    .toBe('Section\nRoom');
  await expect(downloadMenu(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Update preview' }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await otherTab.close();
});

test('keeps a failed autosave edit available for Update preview', async ({
  page,
  courseInstance,
}) => {
  const assessment = await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const printFormId = new URL(page.url()).searchParams.get('form')!;
  await page.route('**/printForms.updateSettings', (route) => route.abort(), { times: 1 });
  await page.getByLabel('Paper size').selectOption('A4');
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await selectOptionalPrintForm({ printFormId, assessmentId: assessment.id }))?.settings
          .paperSize,
    )
    .toBe('A4');
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
});

test('saves form edits without requiring a preview refresh before form actions', async ({
  page,
  courseInstance,
}) => {
  const assessment = await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const formAId = new URL(page.url()).searchParams.get('form')!;
  const preview = page.locator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  const previousPreviewUrl = await preview.getAttribute('src');

  await page.getByLabel('Paper size').focus();
  await page.getByLabel('Paper size').selectOption('A4');
  await expect
    .poll(
      async () =>
        (await selectOptionalPrintForm({ printFormId: formAId, assessmentId: assessment.id }))
          ?.settings.paperSize,
    )
    .toBe('A4');
  await expect(preview).toHaveAttribute('src', previousPreviewUrl!);
  await expect(downloadMenu(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Paper size')).toBeFocused();
  await page.getByLabel('Spacing for question 1', { exact: true }).selectOption('full');
  await page.getByRole('checkbox', { name: 'Include question 2', exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Add form', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Regenerate Form A' })).toBeEnabled();

  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Form B/ })).toBeVisible();
  const formBId = (await page
    .getByRole('button', { name: /^Form B(?: Previewing)?$/ })
    .getAttribute('id'))!.replace('print-form-', '');
  await expect(page.getByLabel('Paper size')).toHaveValue('A4');
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toHaveValue('full');
  await expect(page.getByRole('checkbox', { name: 'Include question 2' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Archive Form B' })).toBeEnabled();

  await page.getByRole('button', { name: 'Form A', exact: true }).click();
  await expect(page.getByLabel('Paper size')).toHaveValue('A4');
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await preview.evaluate((frame) => {
    (frame as HTMLIFrameElement).contentDocument!.documentElement.dataset.cacheMarker = 'form-a';
  });
  await page.getByRole('button', { name: 'Form B', exact: true }).click();
  await expect(preview).toHaveAttribute('src', new RegExp(`/print_form/${formBId}/preview`));
  await expect(page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR).locator(':root')).toHaveAttribute(
    'data-print-status',
    'ready',
    { timeout: 120_000 },
  );
  await page.getByRole('button', { name: 'Form A', exact: true }).click();
  await expect(preview).toHaveAttribute('src', new RegExp(`/print_form/${formAId}/preview`));
  await expect
    .poll(() =>
      preview.evaluate(
        (frame) =>
          (frame as HTMLIFrameElement).contentDocument?.documentElement.dataset.cacheMarker,
      ),
    )
    .toBe('form-a');
  await expect(downloadMenu(page)).toBeEnabled();
});

test('keeps multiple export links after another file is queued and the page reloads', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id, 'exam19-lockpoints-advance');
  await preparePreview(page);
  const label = await printFormLabel(page);
  const stalePage = await page.context().newPage();
  await stalePage.goto(page.url());
  const staleQuestion = stalePage.getByRole('checkbox', {
    name: 'Include question 1',
    exact: true,
  });
  await expect(staleQuestion).toBeEnabled();

  async function queuePdf(item: string) {
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/printableAssessmentExport.pdf'),
    );
    await chooseDownload(page, item);
    const response = await submitted;
    expect(response.status()).toBe(200);
    const body = await response.json();
    const printExportId = z
      .object({ printExportId: z.string() })
      .parse(body.result.data.json).printExportId;
    expect(await (await downloaded).failure()).toBeNull();
    return printExportId;
  }

  const copyId = await queuePdf(`Download Form ${label} (PDF)`);
  await expect(page.locator('#print-prepare-status')).toBeFocused();
  await expect(
    page.getByRole('checkbox', { name: 'Include question 1', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toBeEnabled();
  await staleQuestion.click();
  await expect(
    stalePage
      .getByRole('alert')
      .getByText('Reload the page, then select a question to create a new numbered version.'),
  ).toBeVisible();
  await expect(staleQuestion).toBeChecked();
  await expect(staleQuestion).toBeEnabled();
  await expect(stalePage.getByRole('button', { name: `Form ${label} Previewing` })).toBeEnabled();
  await stalePage.close();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  const recentExports = page.getByRole('region', { name: 'Recent exports' });
  const copyLink = recentExports.locator(`a[href$="/exports/${copyId}"]`);
  const summary = recentExports.getByText(/^Recent exports \(/);
  await expect(summary).toBeVisible();
  await expect(copyLink).toBeVisible({ timeout: 120_000 });
  await summary.click();
  await expect(copyLink).toBeHidden();
  const keyId = await queuePdf(`Download Form ${label} answer key (PDF)`);
  const keyLink = recentExports.locator(`a[href$="/exports/${keyId}"]`);
  await expect(copyLink).toBeVisible({ timeout: 120_000 });
  await expect(keyLink).toBeVisible({ timeout: 120_000 });

  await page.reload();
  await expect(summary).toBeVisible();
  await expect(copyLink).toHaveCount(1);
  await expect(copyLink).toBeHidden();
  await summary.click();
  await expect(copyLink).toBeVisible({ timeout: 120_000 });
  await expect(keyLink).toBeVisible({ timeout: 120_000 });
});

test('creates a new form version when including a question after a download', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const originalFormId = new URL(page.url()).searchParams.get('form')!;
  const question = page.getByRole('checkbox', { name: 'Include question 2', exact: true });
  await question.uncheck();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });

  const file = await downloadPreparedFile(page, async () => {
    await chooseDownload(page, 'Download Form A (PDF)');
  });
  expect(await file.failure()).toBeNull();
  await expect(question).toBeEnabled();
  await question.click();
  const dialog = page.getByRole('dialog', { name: 'Change Form A questions' });
  await expect(dialog.getByText('Form A2', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).not.toBeChecked();
  await question.click();
  await dialog.getByRole('button', { name: 'Create new form version' }).click();

  await expect.poll(() => new URL(page.url()).searchParams.get('form')).not.toBe(originalFormId);
  await expect(page.getByRole('button', { name: 'Form A2 Previewing' })).toBeVisible();
  await expect(question).toBeChecked();
  await page.getByText(/^Previous forms \(/).click();
  await page.getByRole('button', { name: 'Form A', exact: true }).click();
  await expect(question).not.toBeChecked();
  await expect(question).toBeDisabled();
});

test('creates Form A on first visit and recovers if automatic creation fails', async ({
  page,
  courseInstance,
}) => {
  const assessment = await assessmentFor(courseInstance.id, 'exam18-lockpoints');
  const attemptsBefore = await queryScalar(
    sql.count_assessment_instances,
    { assessment_id: assessment.id },
    z.number(),
  );
  const formsBefore = await queryScalar(
    sql.count_print_forms,
    { assessment_id: assessment.id },
    z.number(),
  );
  expect(formsBefore).toBe(0);
  await page.route('**/printForms.ensureInitial', (route) => route.abort('failed'), {
    times: 1,
  });
  await openPrintPreparation(page, courseInstance.id, 'exam18-lockpoints');

  const creationAlert = page.getByRole('alert').filter({ hasText: 'Could not create Form A.' });
  await expect(creationAlert).toBeVisible();
  await creationAlert.getByRole('button', { name: 'Try again' }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: /^Form A(?: Previewing)?$/ })).toBeVisible();
  expect(
    await queryScalar(sql.count_print_forms, { assessment_id: assessment.id }, z.number()),
  ).toBe(formsBefore + 1);
  expect(
    await queryScalar(sql.count_assessment_instances, { assessment_id: assessment.id }, z.number()),
  ).toBe(attemptsBefore);
  const assessmentPage = await page.goto(
    `/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}`,
  );
  expect(assessmentPage?.status()).toBe(200);
});

test('rejects a changed Word snapshot and offers a fresh preview', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id, 'exam13-disableHonorCode');
  await preparePreview(page);

  await page.route(
    '**/print_form/*/docx?*',
    async (route) => {
      const snapshot = JSON.parse(route.request().postData()!) as {
        id: string;
        html: string;
        source: unknown;
      };
      snapshot.html += 'changed';
      await route.continue({ postData: JSON.stringify(snapshot) });
    },
    { times: 1 },
  );
  await chooseDownload(page, `Download Form ${await printFormLabel(page)} Word (.docx)`);
  await expect(
    page.getByRole('alert').getByText('This print preview has expired or changed.'),
  ).toBeVisible();
  const updatePreview = page.getByRole('button', { name: 'Update preview', exact: true });
  await expect(updatePreview).toBeEnabled();
  await updatePreview.click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
});

test('shows errors while preparing PDF pages', async ({ page, courseInstance }) => {
  await openPrintPreparation(page, courseInstance.id, 'exam21-afterCompleteTimeLimit');
  await preparePreview(page);

  await page.route('**/print_form/*/preview?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('document') !== 'answer_key') {
      return await route.continue();
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    return await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html data-print-status="error" data-print-error="Answer key preparation failed"></html>',
    });
  });

  await chooseDownload(page, `Download Form ${await printFormLabel(page)} answer key (PDF)`);
  await expect(page.getByText('Preparing documents 0 of 1…')).toBeVisible();
  await expect(page.getByRole('alert').getByText('Answer key preparation failed')).toBeVisible();
  await expect(downloadMenu(page)).toBeEnabled();
});

test('prepares an assessment and key with consistent variants and downloads', async ({
  page,
  courseInstance,
}) => {
  const assessment = await assessmentFor(courseInstance.id);
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await page.getByRole('link', { name: 'Print', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paper and layout', exact: true })).toBeVisible();
  const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' });
  await expect(
    breadcrumb.getByRole('link', { name: 'Assessment questions', exact: true }),
  ).toHaveAttribute(
    'href',
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await expect(breadcrumb.getByRole('heading', { name: 'Print assessment' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Form A(?:[2-9]|[1-9]\d+)?/ })).toBeVisible();
  await openPrintPreparation(page, courseInstance.id);
  await page.getByLabel('Additional student fields:').fill('Section');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  const previewUrl = await page.locator(ACTIVE_PREVIEW_FRAME_SELECTOR).getAttribute('src');
  const form = previewUrl!.match(/\/print_form\/(\d+)\//)![1];
  const label = await printFormLabel(page, form);
  const url = new URL(page.url());
  url.searchParams.set('form', form);
  await page.goto(url.href);
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Answer key', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(downloadMenu(page)).toBeFocused();
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${label}`) })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const frame = page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  await expect(frame.locator(':root')).toHaveAttribute('data-print-status', 'ready');
  await expect(page.getByRole('heading', { name: /Questions in this form/ })).toBeVisible();
  await expect(page.getByText('No paper-specific concerns detected')).toHaveCount(0);
  await page.getByLabel('Paper size').selectOption('A4');
  await page
    .getByLabel('Additional student fields:')
    .fill(`${' '.repeat(301)}Section\n Student ID \n`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(downloadMenu(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Update preview', exact: true }).first().click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByLabel('Additional student fields:')).toHaveValue('Section\nStudent ID');
  const pageSize = await frame
    .locator('.pagedjs_page')
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
    });
  expect(pageSize.width).toBeCloseTo((210 / 25.4) * 96, 0);
  expect(pageSize.height).toBeCloseTo((297 / 25.4) * 96, 0);
  expect(new URL(page.url()).searchParams.get('form')).toBe(form);
  await page.getByLabel('Spacing for question 1', { exact: true }).selectOption('full');
  await page.getByRole('button', { name: 'Update preview', exact: true }).last().click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator('.printing-question[data-question-number="1"]')).toHaveAttribute(
    'data-print-block-size',
    'full',
  );
  const questionTwo = await frame
    .locator('.printing-question[data-question-number="2"]')
    .innerText();
  await page.getByRole('checkbox', { name: 'Include question 1', exact: true }).uncheck();
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toBeDisabled();
  await expect(downloadMenu(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '1');
  await expect(frame.locator(':root')).toHaveAttribute('data-print-max-points', '10');
  await expect(frame.locator('.printing-question[data-question-number="1"]')).toHaveCount(0);
  await expect(frame.locator('.printing-question[data-question-number="2"]')).toHaveText(
    questionTwo,
    { useInnerText: true },
  );
  await page.reload();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByLabel('Paper size')).toHaveValue('A4');
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toHaveValue('full');
  await expect(
    page.getByRole('checkbox', { name: 'Include question 1', exact: true }),
  ).not.toBeChecked();
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '1');
  await page.getByRole('checkbox', { name: 'Include question 2', exact: true }).uncheck();
  await expect(
    page.getByText('Select at least one question to download an assessment.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Include question 2', exact: true }).check();
  await page.getByRole('button', { name: 'Answer key', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-document', 'answer_key');
  await expect(frame.locator('.printing-question[data-question-number="1"]')).toHaveCount(0);
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '1');
  expect(new URL(page.url()).searchParams.get('form')).toBe(form);
  await page.addScriptTag({ content: axe.source });
  const { violations } = await page.evaluate(async () => await axe.run());
  expect(violations).toEqual([]);
  const file = await downloadPreparedFile(page, async () => {
    await chooseDownload(page, `Download Form ${label} answer key (PDF)`);
  });
  expect(await file.failure()).toBeNull();
  const pdf = await PDFDocument.load(await fs.readFile(await file.path()));
  const { width, height } = pdf.getPage(0).getSize();
  expect(width).toBeCloseTo((210 / 25.4) * 72, 0);
  expect(height).toBeCloseTo((297 / 25.4) * 72, 0);
});

test('prepares homework with matching student copies, answer keys, and Word exports', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw15-lockpoints',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await page.getByRole('link', { name: 'Print', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Form A(?:[2-9]|[1-9]\d+)?/ })).toBeVisible();
  await openPrintPreparation(page, courseInstance.id, 'hw15-lockpoints');
  await page.getByLabel('Additional student fields:').fill('Section');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  const downloadButton = downloadMenu(page);
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  const frame = page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '2');
  await page.getByLabel('Spacing for question HW15.1', { exact: true }).selectOption('full');
  await page.getByRole('checkbox', { name: 'Include question HW15.2', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '1');
  await expect(frame.locator('.printing-question')).toHaveAttribute(
    'data-question-number',
    'HW15.1',
  );
  await expect(frame.locator('.printing-question')).toHaveAttribute(
    'data-print-block-size',
    'full',
  );
  await expect(frame.getByRole('article', { name: 'Homework cover page' })).toBeVisible();
  const question = frame
    .locator('.pagedjs_page')
    .getByText('What percentage score would you like for this question?');
  const questionText = await question.innerText();
  await page.getByRole('button', { name: 'Answer key', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-document', 'answer_key');
  await expect(question).toHaveText(questionText, { useInnerText: true });
  await page.getByRole('button', { name: 'Student copy', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(question).toHaveText(questionText, { useInnerText: true });

  const label = await printFormLabel(page);
  const word = await downloadPreparedFile(
    page,
    async () => {
      await chooseDownload(page, `Download Form ${label} Word (.docx)`);
    },
    'docx',
  );
  expect(word.suggestedFilename()).toMatch(/\.docx$/);
  expect(await word.failure()).toBeNull();
  const archive = await unzipper.Open.file(await word.path());
  const documentXml = (
    await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
  ).toString();
  expect(documentXml).toContain('Question HW15.1');
  expect(documentXml).not.toContain('Question HW15.2');
});

test('combines current forms and answer keys with equal page counts and custom covers', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  const instructor = await getOrCreateUser({
    uid: 'instructor@example.com',
    name: 'Instructor User',
    uin: '100000000',
  });
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: instructor.uid,
    course_role: 'Previewer',
    authn_user_id: instructor.id,
  });
  await page
    .context()
    .addCookies([{ name: 'pl_test_user', value: 'test_instructor', url: baseURL }]);

  const assessment = await openPrintPreparation(page, courseInstance.id);
  await waitForFormA(page);
  for (const form of await selectActivePrintFormsForAssessment({ assessmentId: assessment.id })) {
    if (/^A\d*$/.test(form.label)) continue;
    await archivePrintForm({ printFormId: form.id, assessmentId: assessment.id });
  }

  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const originalFormId = new URL(page.url()).searchParams.get('form')!;
  const originalLabel = await printFormLabel(page, originalFormId);
  expect(originalLabel).toMatch(/^A(?:[2-9]|[1-9]\d+)?$/);
  const nextLabel = `A${Number(originalLabel.slice(1) || 1) + 1}`;
  const originalQuestions = await selectPrintFormQuestions(originalFormId);
  await page.getByRole('button', { name: `Regenerate Form ${originalLabel}` }).click();
  const regenerateDialog = page.getByRole('dialog', {
    name: `Regenerate Form ${originalLabel}`,
  });
  await expect(regenerateDialog.getByText(`Form ${nextLabel}`, { exact: true })).toBeVisible();
  await regenerateDialog.getByRole('button', { name: 'Cancel' }).click();
  expect(new URL(page.url()).searchParams.get('form')).toBe(originalFormId);
  await page.getByRole('button', { name: `Regenerate Form ${originalLabel}` }).click();
  await regenerateDialog.getByRole('button', { name: 'Regenerate form' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('form')).not.toBe(originalFormId);
  const replacementId = new URL(page.url()).searchParams.get('form')!;
  const replacementLabel = await printFormLabel(page, replacementId);
  expect(replacementLabel).toBe(nextLabel);
  await expect(
    page.getByRole('button', { name: new RegExp(`^Form ${replacementLabel}`) }),
  ).toBeFocused();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(
    page.getByRole('button', { name: new RegExp(`^Form ${replacementLabel}`) }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await selectPrintFormQuestions(originalFormId)).toEqual(originalQuestions);
  await page.getByText(/^Previous forms \(/).click();
  await expect(
    page.getByRole('button', { name: `Form ${originalLabel}`, exact: true }),
  ).toBeVisible();

  const formIds = [replacementId];
  const labels = [replacementLabel];
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('form')).not.toBe(replacementId);
  const newId = new URL(page.url()).searchParams.get('form')!;
  const newLabel = await printFormLabel(page, newId);
  await expect(page.getByRole('button', { name: `Archive Form ${replacementLabel}` })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${newLabel}`) })).toBeFocused();
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${newLabel}`) })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  formIds.push(newId);
  labels.push(newLabel);
  expect(new Set(formIds).size).toBe(2);
  const pageCounts: number[] = [];
  const answerKeyPageCounts: number[] = [];
  const frame = page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  for (const [index, label] of labels.entries()) {
    await page
      .getByRole('combobox', { name: 'Preview form', exact: true })
      .selectOption({ label: `Form ${label}` });
    await expect(downloadMenu(page)).toBeEnabled({
      timeout: 120_000,
    });
    await expect(page.getByRole('button', { name: new RegExp(`^Form ${label}`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(new URL(page.url()).searchParams.get('form')).toBe(formIds[index]);
    if (index === 0) {
      await page.getByLabel('Spacing for question 1', { exact: true }).selectOption('full');
      await expect(page.getByRole('combobox', { name: 'Preview form', exact: true })).toBeEnabled();
      await expect(downloadMenu(page)).toBeDisabled();
      await page.getByRole('button', { name: 'Update preview', exact: true }).click();
      await expect(downloadMenu(page)).toBeEnabled({
        timeout: 120_000,
      });
    }
    await expect(frame.locator(':root')).toHaveAttribute('data-print-status', 'ready');
    pageCounts.push(await frame.locator('.pagedjs_page').count());
    await page.getByRole('button', { name: 'Answer key', exact: true }).click();
    await expect(downloadMenu(page)).toBeEnabled({
      timeout: 120_000,
    });
    await expect(frame.locator(':root')).toHaveAttribute('data-print-document', 'answer_key');
    answerKeyPageCounts.push(await frame.locator('.pagedjs_page').count());
    await page.getByRole('button', { name: 'Student copy', exact: true }).click();
    await expect(downloadMenu(page)).toBeEnabled({
      timeout: 120_000,
    });
  }

  const pagesPerForm = Math.max(...pageCounts);
  const cover = await PDFDocument.create();
  cover.addPage([400, 600]).drawText('Extended assessment instructions');
  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'extended-instructions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cover.save()),
  });
  await expect(page.getByText('extended-instructions.pdf', { exact: true })).toBeVisible();
  const wouldWarnOnUnload = () =>
    page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await wouldWarnOnUnload()).toBe(true);
  const formPageCount = pagesPerForm + 1;
  await chooseDownload(page, 'Download all forms PDF');
  const formsModal = page.getByRole('dialog', { name: 'Download all forms PDF', exact: true });
  await expect(
    formsModal.getByText(
      `Each included form consists of ${formPageCount} ${formPageCount === 1 ? 'page' : 'pages'}.`,
    ),
  ).toBeVisible();
  const coveredForms = await downloadPreparedFile(page, async () => {
    await formsModal.getByRole('button', { name: 'Download all forms PDF', exact: true }).click();
  });
  expect(coveredForms.suggestedFilename()).toMatch(/_all_forms\.pdf$/);
  const packet = await PDFDocument.load(await fs.readFile(await coveredForms.path()));
  expect(packet.getPageCount()).toBe(formPageCount * formIds.length);
  expect(packet.getPage(1).getSize()).toEqual({ width: 400, height: 600 });
  expect(packet.getPage(pagesPerForm + 2).getSize()).toEqual({ width: 400, height: 600 });
  await expect(formsModal).toBeHidden();
  expect(await wouldWarnOnUnload()).toBe(false);

  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'new-instructions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cover.save()),
  });
  expect(await wouldWarnOnUnload()).toBe(true);

  const pagesPerAnswerKey = Math.max(...answerKeyPageCounts);
  await chooseDownload(page, 'Download all answer keys PDF');
  const keysModal = page.getByRole('dialog', {
    name: 'Download all answer keys PDF',
    exact: true,
  });
  await expect(
    keysModal.getByText(
      `Each included answer key consists of ${pagesPerAnswerKey} ${pagesPerAnswerKey === 1 ? 'page' : 'pages'}.`,
    ),
  ).toBeVisible();
  const answerKeys = await downloadPreparedFile(page, async () => {
    await keysModal
      .getByRole('button', { name: 'Download all answer keys PDF', exact: true })
      .click();
  });
  expect(answerKeys.suggestedFilename()).toMatch(/_all_answer_keys\.pdf$/);
  expect((await PDFDocument.load(await fs.readFile(await answerKeys.path()))).getPageCount()).toBe(
    pagesPerAnswerKey * formIds.length,
  );
  await expect(keysModal).toBeHidden();
  expect(await wouldWarnOnUnload()).toBe(true);
  await page.getByRole('button', { name: 'Remove cover new-instructions.pdf' }).click();
  expect(await wouldWarnOnUnload()).toBe(false);
  await page.getByRole('button', { name: 'Student copy', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await page
    .getByRole('combobox', { name: 'Preview form', exact: true })
    .selectOption({ label: `Form ${replacementLabel}` });
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toHaveValue('full');
  await page.getByRole('button', { name: 'Remove cover extended-instructions.pdf' }).click();
  await expect(page.getByText('extended-instructions.pdf', { exact: true })).toHaveCount(0);
  await expect(downloadMenu(page)).toBeEnabled();

  const printPath = new URL(page.url()).pathname;
  await page.context().clearCookies();
  await page.goto(printPath);
  for (const label of labels) {
    await expect(
      page.getByRole('button', { name: new RegExp(`^Form ${label}(?: Previewing)?$`) }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole('button', { name: new RegExp(`^Form ${originalLabel}(?: Previewing)?$`) }),
  ).toHaveCount(0);
  await page.getByText(/^Previous forms \(/).click();
  await page.getByRole('button', { name: `Form ${originalLabel}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Student copy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: `Form ${originalLabel} Previewing` }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await page.getByRole('button', { name: `Archive Form ${newLabel}` }).click();
  const archiveDialog = page.getByRole('dialog', { name: `Archive Form ${newLabel}` });
  await expect(
    archiveDialog.getByText(/preview or download it under Previous forms/),
  ).toBeVisible();
  await archiveDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${newLabel}`) })).toBeVisible();
  await page.getByRole('button', { name: `Archive Form ${newLabel}` }).click();
  await archiveDialog.getByRole('button', { name: 'Archive form' }).click();
  await expect(page.getByRole('button', { name: `Form ${newLabel}`, exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp(`^Form ${replacementLabel}`) }),
  ).toBeFocused();
});

test('distinguishes paper review flags from broken questions omitted from the document', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id, 'exam23-printing');
  await waitForFormA(page);
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR).locator(':root')).toHaveAttribute(
    'data-print-status',
    'ready',
    { timeout: 120_000 },
  );
  await expect(page.getByText('Review printability', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText('Omitted', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  const firstOmittedQuestion = page
    .getByRole('group', { name: /^Question / })
    .filter({ has: page.getByText('Omitted', { exact: true }) })
    .first();
  await expect(firstOmittedQuestion).not.toBeInViewport();
  await page.getByRole('button', { name: 'Review questions' }).click();
  await expect(firstOmittedQuestion).toBeInViewport();
  await expect(firstOmittedQuestion).toBeFocused();
  const reviewAlert = page.getByRole('alert').filter({
    has: page.getByRole('button', { name: 'Review questions' }),
  });
  await expect(reviewAlert).toBeVisible();
  await expect(reviewAlert.getByRole('button', { name: 'Dismiss question warning' })).toHaveCount(
    0,
  );
  await expect(downloadMenu(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeEnabled();
  await page.getByLabel(/Show only items to review/).check();
  await expect(page.getByRole('checkbox', { name: 'Include question 1', exact: true })).toHaveCount(
    0,
  );
  const omittedLabels = await page
    .getByRole('group', { name: /^Question / })
    .filter({ has: page.getByText('Omitted', { exact: true }) })
    .getByRole('checkbox')
    .evaluateAll((inputs) => inputs.map((input) => input.getAttribute('aria-label')!));
  for (const label of omittedLabels) {
    await page.getByRole('checkbox', { name: label, exact: true }).click();
    await expect(page.getByRole('checkbox', { name: label, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByText('Review printability', { exact: true }).first()).toBeVisible();
  await expect(reviewAlert.getByRole('button', { name: 'Dismiss question warning' })).toBeVisible();
  await reviewAlert.getByRole('button', { name: 'Dismiss question warning' }).click();
  await expect(reviewAlert).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Print assessment' })).toBeFocused();
  await expect(page.getByText('Omitted', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  for (const label of omittedLabels) {
    await expect(page.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked();
  }
  await expect(page.getByText('Omitted', { exact: true })).toHaveCount(0);
  const firstConcernQuestion = page
    .getByRole('group', { name: /^Question / })
    .filter({ has: page.getByText('Review printability', { exact: true }) })
    .first();
  await expect(firstConcernQuestion).not.toBeInViewport();
  await page.getByRole('button', { name: 'Review questions' }).click();
  await expect(firstConcernQuestion).toBeInViewport();
  await expect(firstConcernQuestion).toBeFocused();
  await reviewAlert.getByRole('button', { name: 'Dismiss question warning' }).click();
  await expect(reviewAlert).toHaveCount(0);

  const firstFormId = new URL(page.url()).searchParams.get('form');
  const firstLabel = await printFormLabel(page);
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('form'), {
      timeout: 120_000,
    })
    .not.toBe(firstFormId);
  await expect(reviewAlert).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Preview form', exact: true })
    .selectOption({ label: `Form ${firstLabel}` });
  await expect(reviewAlert).toBeVisible();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await reviewAlert.getByRole('button', { name: 'Dismiss question warning' }).click();
  await firstConcernQuestion.getByRole('checkbox').click();
  await expect(reviewAlert).toBeVisible();
});

test('retries a failed combined PDF download from its modal', async ({ page, courseInstance }) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await chooseDownload(page, 'Download all answer keys PDF');
  const modal = page.getByRole('dialog', { name: 'Download all answer keys PDF', exact: true });
  const submit = modal.getByRole('button', { name: 'Download all answer keys PDF', exact: true });
  await expect(
    modal.getByText(/^Each included answer key consists of \d+ pages?\.$/),
  ).toBeVisible();
  await page.route('**/printableAssessmentExport.pdf', (route) => route.abort(), { times: 1 });
  await submit.click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(submit).toBeEnabled();
  await page.unroute('**/printableAssessmentExport.pdf');

  const downloaded = await downloadPreparedFile(page, async () => {
    await submit.click();
  });
  expect(await downloaded.failure()).toBeNull();
  await expect(modal).toBeHidden();
  await expect(downloadMenu(page)).toBeEnabled();
  await expect(
    page.getByRole('region', { name: 'Recent exports' }).locator('summary'),
  ).toBeFocused();
});
test('keeps existing forms available when randomization is disabled', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const assessmentFile = `${testCoursePath}/courseInstances/Sp15/assessments/exam20-assessmentTools/infoAssessment.json`;
  const questionFile = `${testCoursePath}/questions/partialCredit3/info.json`;
  const originalAssessment = await fs.readFile(assessmentFile, 'utf8');
  const originalQuestion = await fs.readFile(questionFile, 'utf8');
  const assessmentInfo = {
    ...JSON.parse(originalAssessment),
    shuffleQuestions: true,
    zones: [
      { numberChoose: 1, questions: [{ id: 'partialCredit3', autoPoints: 10, numberChoose: 1 }] },
    ],
  };
  try {
    await fs.writeFile(
      questionFile,
      JSON.stringify({ ...JSON.parse(originalQuestion), singleVariant: true }),
    );
    await fs.writeFile(assessmentFile, JSON.stringify(assessmentInfo));
    await syncCourse(testCoursePath);
    await openPrintPreparation(page, courseInstance.id);
    await expect(page.getByRole('heading', { name: 'Print forms', exact: true })).toBeVisible();
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Add form', exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Preview form', exact: true }).getByRole('option'),
    ).toHaveCount(2);
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    assessmentInfo.shuffleQuestions = false;
    await fs.writeFile(assessmentFile, JSON.stringify(assessmentInfo));
    await syncCourse(testCoursePath);
    await page.reload();
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    await expect(page.getByRole('heading', { name: 'Print forms', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add form', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('combobox', { name: 'Preview form', exact: true }).getByRole('option'),
    ).toHaveCount(2);
    await downloadMenu(page).click();
    await expect(
      page.getByRole('button', {
        name: `Download Form ${await printFormLabel(page)} (PDF)`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Download all forms PDF', exact: true }),
    ).toBeVisible();
  } finally {
    await fs.writeFile(assessmentFile, originalAssessment);
    await fs.writeFile(questionFile, originalQuestion);
    await syncCourse(testCoursePath);
  }
});

test('lets instructors choose grading and pledge content on the cover', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  const pledge = page.getByRole('checkbox', {
    name: 'Include academic integrity pledge',
    exact: true,
  });
  const grading = page.getByRole('checkbox', { name: 'Include grading table', exact: true });
  await expect(pledge).toBeChecked();
  await expect(grading).not.toBeChecked();
  await grading.check();
  await pledge.uncheck();
  await preparePreview(page);
  const frame = page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  await expect(frame.getByRole('region', { name: 'Grading table' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Academic integrity pledge' })).toHaveCount(0);
  await pledge.check();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(frame.getByRole('heading', { name: 'Academic integrity pledge' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Include default cover page', exact: true }).uncheck();
  await expect(pledge).toHaveCount(0);
  await expect(grading).toHaveCount(0);
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator('.assessment-cover')).toHaveCount(0);
});
