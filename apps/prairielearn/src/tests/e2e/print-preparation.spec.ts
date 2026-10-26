import fs from 'node:fs/promises';

import type { Page } from '@playwright/test';
import axe from 'axe-core';
import { PDFDocument } from 'pdf-lib';
import * as unzipper from 'unzipper';

import { MAX_INLINE_PRINT_PACKET_PAGES } from '../../lib/client/print-packet.js';
import { selectAssessmentInstanceById } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { syncCourse } from '../helperCourse.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ features: { 'printable-assessments': true } });

test.describe.configure({ timeout: 180_000 });

/** The footer download menu gates every export, so its toggle stands in for "ready to download". */
function downloadMenu(page: Page) {
  return page.getByRole('button', { name: 'Download', exact: true });
}

async function chooseDownload(page: Page, item: string) {
  await downloadMenu(page).click();
  await page.getByRole('button', { name: item, exact: true }).click();
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
    `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
  );
  return assessment;
}

async function preparePreview(page: Page) {
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
}

test('recovers when creating the first preview fails', async ({ page, courseInstance }) => {
  await page.route('**/printableAssessments.create', (route) => route.abort('failed'), {
    times: 1,
  });
  const assessment = await openPrintPreparation(page, courseInstance.id);

  const createPreview = page.getByRole('button', { name: 'Create preview', exact: true });
  await createPreview.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(createPreview).toBeEnabled();

  await createPreview.click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  const instanceId = new URL(page.url()).searchParams.get('instance')!;
  expect((await selectAssessmentInstanceById(instanceId)).for_printing).toBe(true);
  await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
  await expect(page.locator(`a[href*="/assessment_instance/${instanceId}/"]`)).toHaveCount(0);
  // An earlier test may have started a regular attempt, so this page can open that instead.
  const assessmentPage = await page.goto(
    `/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}`,
  );
  expect(assessmentPage?.status()).toBe(200);
  expect(page.url()).not.toContain(`/assessment_instance/${instanceId}`);
});

test('rejects a changed Word snapshot and offers a fresh preview', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);

  await page.route(
    '**/print/docx?*',
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
  await chooseDownload(page, 'Download Form A Word (.docx)');
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

  await page.route('**/print/preview?*', async (route) => {
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

  await chooseDownload(page, 'Download Form A answer key (PDF)');
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
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableAssessments.list'),
  );
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paper and layout', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Questions', exact: true })).toHaveAttribute(
    'href',
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await instancesLoaded;
  await page.getByLabel('Additional student information').fill('Section');
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  const previewUrl = await page
    .getByTitle('Printable document preview', { exact: true })
    .getAttribute('src');
  const form = previewUrl!.match(/\/assessment_instance\/(\d+)\/print\//)![1];
  const url = new URL(page.url());
  url.searchParams.set('instances', form);
  url.searchParams.set('instance', form);
  await page.goto(url.href);
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: /^Form A/ })).toHaveAttribute(
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
  expect(new URL(page.url()).searchParams.get('instance')).toBe(form);
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
  expect(new URL(page.url()).searchParams.get('instance')).toBe(form);
  await page.addScriptTag({ content: axe.source });
  const { violations } = await page.evaluate(async () => await axe.run());
  expect(violations).toEqual([]);
  const downloaded = page.waitForEvent('download', { timeout: 120_000 });
  await chooseDownload(page, 'Download Form A answer key (PDF)');
  const file = await downloaded;
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
  expect(new URL(page.url()).searchParams.get('instance')).toBe(form);
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
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableAssessments.list'),
  );
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await instancesLoaded;
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

  const wordDownload = page.waitForEvent('download', { timeout: 120_000 });
  await chooseDownload(page, 'Download Form A Word (.docx)');
  const word = await wordDownload;
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

  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableAssessments.list'),
  );
  await openPrintPreparation(page, courseInstance.id);
  await instancesLoaded;
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  const originalInstanceId = new URL(page.url()).searchParams.get('instance')!;
  const originalInstance = await selectAssessmentInstanceById(originalInstanceId);
  await page.getByRole('button', { name: 'Regenerate Form A', exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('instance'))
    .not.toBe(originalInstanceId);
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByRole('button', { name: /^Form A/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await selectAssessmentInstanceById(originalInstanceId)).toEqual(originalInstance);

  const formIds = [new URL(page.url()).searchParams.get('instance')!];
  await page.getByRole('button', { name: 'Add assessment instance', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Form B/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  formIds.push(new URL(page.url()).searchParams.get('instance')!);
  expect(new Set(formIds).size).toBe(2);
  const pageCounts: number[] = [];
  const answerKeyPageCounts: number[] = [];
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
  for (const label of ['A', 'B']) {
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
    expect(new URL(page.url()).searchParams.get('instance')).toBe(
      formIds[['A', 'B'].indexOf(label)],
    );
    if (label === 'A') {
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

  // Every form, one copy each, before any cover pages are uploaded.
  const allForms = page.waitForEvent('download', { timeout: 120_000 });
  const allFormsResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableAssessmentExport.pdf'),
  );
  await chooseDownload(page, 'Download all forms (PDF)');
  expect((await allFormsResponse).status()).toBe(200);
  const allFormsDownload = await allForms;
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
  expect(new URL(page.url()).searchParams.get('instances')?.split(',')).toEqual(formIds);
  const copies = 45;
  await chooseDownload(page, 'Download booklet PDF…');
  await page.getByLabel('Number of students', { exact: true }).fill(String(copies));
  await expect(
    page.getByText('Forms A, B repeat in order, one complete copy per student.', {
      exact: false,
    }),
  ).toBeVisible();
  const expectedStudentPages = Array.from(
    { length: copies },
    (_, index) => pageCounts[index % pageCounts.length] + 1,
  ).reduce((total, count) => total + count, 0);
  const expectedPageCount =
    expectedStudentPages + answerKeyPageCounts.reduce((total, count) => total + count, 0);
  expect(expectedPageCount).toBeGreaterThanOrEqual(MAX_INLINE_PRINT_PACKET_PAGES);
  const downloaded = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Download booklet PDF', exact: true }).click();
  const preparedPdf = page.getByRole('link', {
    name: `Download booklet PDF for ${copies} students`,
  });
  await expect(preparedPdf).toBeVisible({ timeout: 120_000 });
  await preparedPdf.click();
  const download = await downloaded;
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
    .selectOption({ label: 'Form A' });
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toHaveValue('full');
  await page.getByRole('button', { name: 'Remove cover extended-instructions.pdf' }).click();
  await expect(page.getByText('extended-instructions.pdf', { exact: true })).toHaveCount(0);
  await expect(downloadMenu(page)).toBeEnabled();
});

test('distinguishes paper review flags from broken questions omitted from the document', async ({
  page,
  courseInstance,
}) => {
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableAssessments.list'),
  );
  await openPrintPreparation(page, courseInstance.id, 'exam23-printing');
  await instancesLoaded;
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

  await page.getByRole('button', { name: 'Add assessment instance', exact: true }).click();
  await expect(page.getByText('Omitted', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await page
    .getByRole('combobox', { name: 'Preview form', exact: true })
    .selectOption({ label: 'Form A' });
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await chooseDownload(page, 'Download Form B Word (.docx)');
  await expect(
    page.getByText('Form B has missing or unprintable questions.', { exact: false }),
  ).toBeVisible({ timeout: 120_000 });
});

test('validates a booklet count and retries a failed download', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  await chooseDownload(page, 'Download booklet PDF…');
  const modal = page.getByRole('dialog', { name: 'Download booklet PDF', exact: true });
  const students = modal.getByLabel('Number of students', { exact: true });
  const submit = modal.getByRole('button', { name: 'Download booklet PDF', exact: true });
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

  const downloaded = page.waitForEvent('download', { timeout: 120_000 });
  await submit.click();
  expect(await (await downloaded).failure()).toBeNull();
  await expect(downloadMenu(page)).toBeEnabled();
});
test('limits static assessments to one form', async ({ page, courseInstance, testCoursePath }) => {
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
    await expect(
      page.getByRole('heading', { name: 'Assessment instances', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Create preview', exact: true }).click();
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Add assessment instance', exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Preview form', exact: true }).getByRole('option'),
    ).toHaveCount(2);
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    assessmentInfo.shuffleQuestions = false;
    await fs.writeFile(assessmentFile, JSON.stringify(assessmentInfo));
    await syncCourse(testCoursePath);
    await page.reload();
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    await expect(
      page.getByRole('heading', { name: 'Assessment instances', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add assessment instance', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Preview form', exact: true })).toHaveCount(0);
    await downloadMenu(page).click();
    await expect(
      page.getByRole('button', { name: 'Download Form A (PDF)', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Download Form B/ })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Download all forms (PDF)', exact: true }),
    ).toHaveCount(0);
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
