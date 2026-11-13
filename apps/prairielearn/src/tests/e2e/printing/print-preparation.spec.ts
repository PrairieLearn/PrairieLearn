import fs from 'node:fs/promises';

import type { Page } from '@playwright/test';
import axe from 'axe-core';
import { PDFDocument } from 'pdf-lib';
import * as unzipper from 'unzipper';
import { z } from 'zod';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';

import { selectAssessmentByTid } from '../../../models/assessment.js';
import { insertCoursePermissionsByUserUid } from '../../../models/course-permissions.js';
import { selectPrintFormQuestions } from '../../../models/print-form-question.js';
import { selectOptionalPrintForm } from '../../../models/print-form.js';
import { syncCourse } from '../../helperCourse.js';
import { getOrCreateUser } from '../../utils/auth.js';
import { createTest, expect } from '../fixtures.js';

const sql = loadSqlEquiv(import.meta.url);
const test = createTest({ features: { 'printable-assessments': true } });

test.describe.configure({ timeout: 180_000 });

/** The preparation menu gates every export, so its toggle stands in for "ready to prepare". */
function downloadMenu(page: Page) {
  return page.getByRole('button', { name: 'Prepare…', exact: true });
}

async function choosePrepare(page: Page, item: string) {
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
    `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessment.id}/print?forms=`,
  );
  return assessment;
}

async function preparePreview(page: Page) {
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
}

async function printFormLabel(page: Page, printFormId?: string) {
  const url = new URL(page.url());
  const assessmentId = url.pathname.match(/\/assessment\/(\d+)\//)![1];
  const formId = printFormId ?? url.searchParams.get('form')!;
  const form = await selectOptionalPrintForm({ printFormId: formId, assessmentId });
  return form!.label;
}

test('keeps multiple export links after another file is queued and the page reloads', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const label = await printFormLabel(page);

  async function queuePdf(item: string) {
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/printableAssessmentExport.pdf'),
    );
    await choosePrepare(page, item);
    const response = await submitted;
    expect(response.status()).toBe(200);
    const body = await response.json();
    const printExportId = z
      .object({ printExportId: z.string() })
      .parse(body.result.data.json).printExportId;
    expect(await (await downloaded).failure()).toBeNull();
    return printExportId;
  }

  const copyId = await queuePdf(`Prepare Form ${label} (PDF)`);
  await expect(page.locator('#print-prepare-status')).toBeFocused();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  const keyId = await queuePdf(`Prepare Form ${label} answer key (PDF)`);
  const recentExports = page.getByRole('region', { name: 'Recent exports' });
  const copyLink = recentExports.locator(`a[href$="/exports/${copyId}"]`);
  const keyLink = recentExports.locator(`a[href$="/exports/${keyId}"]`);
  await expect(copyLink).toBeVisible({ timeout: 120_000 });
  await expect(keyLink).toBeVisible({ timeout: 120_000 });

  await page.reload();
  await expect(copyLink).toBeVisible({ timeout: 120_000 });
  await expect(keyLink).toBeVisible({ timeout: 120_000 });
});

test('recovers when creating the first preview fails', async ({ page, courseInstance }) => {
  await page.route('**/printForms.create', (route) => route.abort('failed'), {
    times: 1,
  });
  const assessment = await openPrintPreparation(page, courseInstance.id);
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

  const createPreview = page.getByRole('button', { name: 'Create preview', exact: true });
  await createPreview.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(createPreview).toBeEnabled();
  await expect(createPreview).toBeFocused();
  await page.getByRole('alert').getByRole('button').click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.matches('h1, a[href*="/exports/"]')))
    .toBe(true);

  await createPreview.click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeFocused();
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
  await openPrintPreparation(page, courseInstance.id);
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
  await choosePrepare(page, `Prepare Form ${await printFormLabel(page)} Word (.docx)`);
  await expect(
    page.getByRole('alert').getByText('This print preview has expired or changed.'),
  ).toBeVisible();
  const updatePreview = page.getByRole('button', { name: 'Update preview', exact: true });
  await expect(updatePreview).toBeEnabled();
  await updatePreview.click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
});

test('shows errors while preparing PDF pages', async ({ page, courseInstance }) => {
  await openPrintPreparation(page, courseInstance.id);
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

  await choosePrepare(page, `Prepare Form ${await printFormLabel(page)} answer key (PDF)`);
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
  const formsLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printForms.list'),
  );
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paper and layout', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Questions', exact: true })).toHaveAttribute(
    'href',
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await formsLoaded;
  await openPrintPreparation(page, courseInstance.id);
  await page.getByLabel('Additional student information').fill('Section');
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  const previewUrl = await page
    .getByTitle('Printable document preview', { exact: true })
    .getAttribute('src');
  const form = previewUrl!.match(/\/print_form\/(\d+)\//)![1];
  const label = await printFormLabel(page, form);
  const url = new URL(page.url());
  url.searchParams.set('forms', form);
  url.searchParams.set('form', form);
  await page.goto(url.href);
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Answer key', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Open preview in a new tab' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(downloadMenu(page)).toBeFocused();
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${label}`) })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
  await expect(frame.locator(':root')).toHaveAttribute('data-print-status', 'ready');
  await expect(page.getByRole('heading', { name: /Questions in this form/ })).toBeVisible();
  await expect(page.getByText('No paper-specific concerns detected')).toHaveCount(0);
  await page.getByLabel('Paper size').selectOption('A4');
  await page
    .getByLabel('Additional student information')
    .fill(`${' '.repeat(301)}Section\n Student ID \n`);
  await expect(downloadMenu(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Update preview', exact: true }).first().click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByLabel('Additional student information')).toHaveValue(
    'Section\nStudent ID',
  );
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
    page.getByText('Select at least one question to prepare an assessment.'),
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
    await choosePrepare(page, `Prepare Form ${label} answer key (PDF)`);
  });
  expect(await file.failure()).toBeNull();
  const pdf = await PDFDocument.load(await fs.readFile(await file.path()));
  const { width, height } = pdf.getPage(0).getSize();
  expect(width).toBeCloseTo((210 / 25.4) * 72, 0);
  expect(height).toBeCloseTo((297 / 25.4) * 72, 0);
  await page.getByRole('checkbox', { name: 'Include question 1', exact: true }).check();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '2');
  await expect(frame.locator('.printing-question[data-question-number="1"]')).toHaveAttribute(
    'data-print-block-size',
    'full',
  );
  expect(new URL(page.url()).searchParams.get('form')).toBe(form);
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
  const formsLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printForms.list'),
  );
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await formsLoaded;
  await openPrintPreparation(page, courseInstance.id, 'hw15-lockpoints');
  await page.getByLabel('Additional student information').fill('Section');
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  const downloadButton = downloadMenu(page);
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
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
      await choosePrepare(page, `Prepare Form ${label} Word (.docx)`);
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

test('combines assessment copies with custom covers and appends every form’s answer key', async ({
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

  // Keep an older shared form active so archive must focus the adjacent form.
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);

  const formsLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printForms.list'),
  );
  await openPrintPreparation(page, courseInstance.id);
  await formsLoaded;
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  const originalFormId = new URL(page.url()).searchParams.get('form')!;
  const originalLabel = await printFormLabel(page, originalFormId);
  const originalQuestions = await selectPrintFormQuestions(originalFormId);
  await page.getByRole('button', { name: `Regenerate Form ${originalLabel}` }).click();
  const regenerateDialog = page.getByRole('dialog', {
    name: `Regenerate Form ${originalLabel}`,
  });
  await expect(regenerateDialog.getByText(/labels are never reused/)).toBeVisible();
  await regenerateDialog.getByRole('button', { name: 'Cancel' }).click();
  expect(new URL(page.url()).searchParams.get('form')).toBe(originalFormId);
  await page.getByRole('button', { name: `Regenerate Form ${originalLabel}` }).click();
  await regenerateDialog.getByRole('button', { name: 'Regenerate form' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('form')).not.toBe(originalFormId);
  const replacementId = new URL(page.url()).searchParams.get('form')!;
  const replacementLabel = await printFormLabel(page, replacementId);
  expect(replacementLabel).not.toBe(originalLabel);
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
    page.getByRole('button', { name: `View Form ${originalLabel} answer key` }),
  ).toBeVisible();

  const formIds = [replacementId];
  const labels = [replacementLabel];
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('form')).not.toBe(replacementId);
  const newId = new URL(page.url()).searchParams.get('form')!;
  const newLabel = await printFormLabel(page, newId);
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
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
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
      await expect(
        page.getByRole('combobox', { name: 'Preview form', exact: true }),
      ).toBeDisabled();
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

  const allFormsDownload = await downloadPreparedFile(page, async () => {
    await choosePrepare(page, 'Prepare all forms (PDF)');
  });
  expect(allFormsDownload.suggestedFilename()).toMatch(/assessment_2_copies\.pdf$/);
  expect(
    (await PDFDocument.load(await fs.readFile(await allFormsDownload.path()))).getPageCount(),
  ).toBe(pageCounts.reduce((total, count) => total + count, 0));

  const cover = await PDFDocument.create();
  cover.addPage([400, 600]).drawText('Extended assessment instructions');
  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'extended-instructions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cover.save()),
  });
  await expect(page.getByText('extended-instructions.pdf', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('forms')?.split(',')).toEqual(formIds);
  const copies = 45;
  await choosePrepare(page, 'Prepare booklet PDF…');
  await page.getByLabel('Number of students', { exact: true }).fill(String(copies));
  await expect(
    page.getByText(`Forms ${labels.join(', ')} repeat in order, one complete copy per student.`, {
      exact: false,
    }),
  ).toBeVisible();
  const expectedStudentPages = Array.from(
    { length: copies },
    (_, index) => pageCounts[index % pageCounts.length] + 1,
  ).reduce((total, count) => total + count, 0);
  const expectedPageCount =
    expectedStudentPages + answerKeyPageCounts.reduce((total, count) => total + count, 0);
  const download = await downloadPreparedFile(page, async () => {
    await page.getByRole('button', { name: 'Prepare booklet PDF', exact: true }).click();
  });
  expect(await download.failure()).toBeNull();
  const packet = await PDFDocument.load(await fs.readFile(await download.path()));
  expect(packet.getPageCount()).toBe(expectedPageCount);
  expect(packet.getPage(1).getSize()).toEqual({ width: 400, height: 600 });
  expect(packet.getPage(pageCounts[0] + 2).getSize()).toEqual({ width: 400, height: 600 });
  expect(packet.getPage(expectedStudentPages).getSize()).toEqual({ width: 612, height: 792 });
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
  await page.getByRole('button', { name: `View Form ${originalLabel} answer key` }).click();
  await expect(page.getByRole('button', { name: 'Answer key', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await page.getByRole('button', { name: `Archive Form ${newLabel}` }).click();
  const archiveDialog = page.getByRole('dialog', { name: `Archive Form ${newLabel}` });
  await expect(archiveDialog.getByText(/remain available in Previous forms/)).toBeVisible();
  await archiveDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${newLabel}`) })).toBeVisible();
  await page.getByRole('button', { name: `Archive Form ${newLabel}` }).click();
  await archiveDialog.getByRole('button', { name: 'Archive form' }).click();
  await expect(
    page.getByRole('button', { name: `View Form ${newLabel} answer key` }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp(`^Form ${replacementLabel}`) }),
  ).toBeFocused();
});

test('distinguishes paper review flags from broken questions omitted from the document', async ({
  page,
  courseInstance,
}) => {
  const formsLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printForms.list'),
  );
  await openPrintPreparation(page, courseInstance.id, 'exam23-printing');
  await formsLoaded;
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(page.getByText('Review printability', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText('Omitted', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
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
  await expect(page.getByText('Omitted', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  for (const label of omittedLabels) {
    await expect(page.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked();
  }
  await expect(page.getByText('Omitted', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('forms')?.split(',').length, {
      timeout: 120_000,
    })
    .toBe(2);
  const firstLabel = await printFormLabel(
    page,
    new URL(page.url()).searchParams.get('forms')!.split(',')[0],
  );
  await expect(page.getByText('Omitted', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await page
    .getByRole('combobox', { name: 'Preview form', exact: true })
    .selectOption({ label: `Form ${firstLabel}` });
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
});

test('validates a booklet count and retries a failed download', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  await choosePrepare(page, 'Prepare booklet PDF…');
  const modal = page.getByRole('dialog', { name: 'Prepare booklet PDF', exact: true });
  const students = modal.getByLabel('Number of students', { exact: true });
  const submit = modal.getByRole('button', { name: 'Prepare booklet PDF', exact: true });
  await students.fill('0');
  await submit.click();
  await expect(students).toHaveAttribute('aria-invalid', 'true');
  await expect(modal.getByText('Enter a whole number between 1 and 500.')).toBeVisible();

  await students.fill('2');
  await page.route('**/printableAssessmentExport.pdf', (route) => route.abort(), { times: 1 });
  await submit.click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(submit).toBeEnabled();
  await page.unroute('**/printableAssessmentExport.pdf');

  const downloaded = await downloadPreparedFile(page, async () => {
    await submit.click();
  });
  expect(await downloaded.failure()).toBeNull();
  await expect(downloadMenu(page)).toBeEnabled();
  await expect(downloadMenu(page)).toBeFocused();
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
    await page.getByRole('button', { name: 'Create preview', exact: true }).click();
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
    await expect(page.getByRole('button', { name: 'Add form', exact: true })).toBeDisabled();
    await expect(
      page.getByRole('combobox', { name: 'Preview form', exact: true }).getByRole('option'),
    ).toHaveCount(2);
    await downloadMenu(page).click();
    await expect(page.getByRole('button', { name: /^Prepare Form [A-Z]+ \(PDF\)$/ })).toHaveCount(
      1,
    );
    await expect(
      page.getByRole('button', { name: 'Prepare all forms (PDF)', exact: true }),
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
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
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
