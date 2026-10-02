import fs from 'node:fs/promises';

import type { Page } from '@playwright/test';
import axe from 'axe-core';
import { PDFDocument } from 'pdf-lib';
import * as unzipper from 'unzipper';

import { withResolvers } from '@prairielearn/utils';

import { PrintPacketMetadataSchema } from '../../lib/print-packet-schema.js';
import { selectAssessmentInstanceById } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

test.describe.configure({ timeout: 180_000 });

/** The footer download menu gates every export, so its toggle stands in for "ready to download". */
function downloadMenu(page: Page) {
  return page.getByRole('button', { name: 'Download', exact: true });
}

async function chooseDownload(page: Page, item: string) {
  await downloadMenu(page).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}

test('prepares an exam and key with consistent variants and downloads', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableExams.list'),
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
  const form = previewUrl!.match(/\/assessment_instance\/(\d+)\/paper\//)![1];
  // The active form can come from the URL or fall back to the first selected instance.
  for (const explicitSelection of [false, true]) {
    const url = new URL(page.url());
    url.searchParams.set('instances', form);
    if (explicitSelection) url.searchParams.set('instance', form);
    else url.searchParams.delete('instance');
    await page.goto(url.href);
    await expect(downloadMenu(page)).toBeEnabled({
      timeout: 120_000,
    });
    const activeForm = page.getByRole('button', { name: /^Form A/ });
    await expect(activeForm).toHaveAttribute('aria-pressed', 'true');
    await activeForm.click();
    await downloadMenu(page).click();
    for (const name of [
      'Download Form A (PDF)',
      'Download Form A Word (.docx)',
      'Download Form A answer key (PDF)',
      'Download booklet PDF…',
    ]) {
      await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
    }
    // A single form has nothing to combine.
    await expect(
      page.getByRole('button', { name: 'Download all forms (PDF)', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(url.href);
  }
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
  await expect(frame.locator(':root')).toHaveAttribute('data-print-paper-size', 'A4');
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
  for (const [item, extension] of [
    ['Download Form A answer key (PDF)', 'pdf'],
    ['Download Form A Word (.docx)', 'docx'],
  ]) {
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    const request = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(
        extension === 'pdf' ? '/printableExamExport.pdf' : '/paper/docx',
      ),
    );
    await chooseDownload(page, item);
    const exportRequest = await request;
    if (extension === 'pdf') {
      const input = await new Response(Uint8Array.from(exportRequest.postDataBuffer()!), {
        headers: exportRequest.headers(),
      }).formData();
      const metadata = PrintPacketMetadataSchema.parse(
        JSON.parse(input.get('metadata')!.toString()),
      );
      expect(metadata).toMatchObject({
        instances: [
          { assessmentInstanceId: form, formLabel: 'A', settings: { excludedQuestions: ['1'] } },
        ],
        copies: 1,
        document: 'answer_key',
      });
    } else {
      const search = new URL(exportRequest.url()).searchParams;
      expect(search.getAll('exclude_question')).toEqual(['1']);
      expect(search.get('document')).toBe('exam');
    }
    const file = await downloaded;
    if (extension === 'pdf') {
      expect(file.suggestedFilename()).toMatch(/answer_keys_1_copies\.pdf$/);
    } else {
      expect(file.suggestedFilename()).toBe('assessment-form-A.docx');
    }
    expect(await file.failure()).toBeNull();
    await expect(downloadMenu(page)).toBeEnabled();
  }
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

test('prepares homework with matching student copies, answer keys, and booklet exports', async ({
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
    new URL(response.url()).pathname.endsWith('/printableExams.list'),
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
  const studentPageCount = await frame.locator('.pagedjs_page').count();
  await page.getByRole('button', { name: 'Answer key', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-document', 'answer_key');
  await expect(question).toHaveText(questionText, { useInnerText: true });
  const answerKeyPageCount = await frame.locator('.pagedjs_page').count();
  await page.getByRole('button', { name: 'Student copy', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(question).toHaveText(questionText, { useInnerText: true });

  for (const [item, extension] of [
    ['Download Form A (PDF)', 'pdf'],
    ['Download Form A Word (.docx)', 'docx'],
  ]) {
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    await chooseDownload(page, item);
    const download = await downloaded;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).not.toContain('exam');
    const data = await fs.readFile(await download.path());
    if (extension === 'pdf') {
      expect((await PDFDocument.load(data)).getPageCount()).toBe(studentPageCount);
    } else {
      expect(download.suggestedFilename()).toBe('assessment-form-A.docx');
      const archive = await unzipper.Open.buffer(data);
      const documentXml = (
        await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
      ).toString();
      expect(documentXml).toContain('Question HW15.1');
      expect(documentXml).not.toContain('Question HW15.2');
    }
  }
  await chooseDownload(page, 'Download booklet PDF…');
  await page.getByLabel('Number of students', { exact: true }).fill('3');
  const downloaded = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Download booklet PDF', exact: true }).click();
  const download = await downloaded;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await download.failure()).toBeNull();
  const packet = await PDFDocument.load(await fs.readFile(await download.path()));
  expect(packet.getPageCount()).toBe(3 * studentPageCount + answerKeyPageCount);
});

test('combines exam copies with custom covers and appends every form’s answer key', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableExams.list'),
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
  );
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
  for (const label of ['B', 'C']) {
    await page.getByRole('button', { name: 'Add assessment instance', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^Form ${label}`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(downloadMenu(page)).toBeEnabled({
      timeout: 120_000,
    });
    formIds.push(new URL(page.url()).searchParams.get('instance')!);
  }
  expect(new Set(formIds).size).toBe(3);
  const pageCounts: number[] = [];
  const answerKeyPageCounts: number[] = [];
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
  for (const label of ['A', 'B', 'C']) {
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
      formIds[['A', 'B', 'C'].indexOf(label)],
    );
    if (label === 'B') {
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
  await chooseDownload(page, 'Download all forms (PDF)');
  const allFormsDownload = await allForms;
  expect(allFormsDownload.suggestedFilename()).toMatch(/assessment_3_copies\.pdf$/);
  expect(
    (await PDFDocument.load(await fs.readFile(await allFormsDownload.path()))).getPageCount(),
  ).toBe(pageCounts.reduce((total, count) => total + count, 0));

  // Download a different form without changing the active preview or losing its saved spacing.
  for (const extension of ['pdf', 'docx']) {
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    const requested = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(
        extension === 'pdf' ? '/printableExamExport.pdf' : '/paper/docx',
      ),
    );
    await chooseDownload(
      page,
      extension === 'pdf' ? 'Download Form B (PDF)' : 'Download Form B Word (.docx)',
    );
    const request = await requested;
    if (extension === 'pdf') {
      const input = await new Response(Uint8Array.from(request.postDataBuffer()!), {
        headers: request.headers(),
      }).formData();
      expect(
        PrintPacketMetadataSchema.parse(JSON.parse(input.get('metadata')!.toString())),
      ).toMatchObject({
        instances: [
          {
            assessmentInstanceId: formIds[1],
            formLabel: 'B',
            settings: { questionSizes: { '1': 'full' } },
          },
        ],
        copies: 1,
        document: 'exam',
      });
    } else {
      const url = new URL(request.url());
      expect(url.pathname).toContain(`/assessment_instance/${formIds[1]}/paper/docx`);
      expect(url.searchParams.get('form_label')).toBe('B');
      expect(url.searchParams.getAll('question_block_size')).toEqual(['1:full']);
    }
    expect(await (await downloaded).failure()).toBeNull();
    await expect(page.getByRole('combobox', { name: 'Preview form', exact: true })).toHaveValue(
      formIds[2],
    );
  }

  const cover = await PDFDocument.create();
  cover.addPage([400, 600]).drawText('Extended exam instructions');
  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'extended-instructions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cover.save()),
  });
  await expect(page.getByText('extended-instructions.pdf', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('instances')?.split(',')).toEqual(formIds);
  let exports = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/printableExamExport.pdf')) exports++;
  });
  for (const copies of [45, 1]) {
    await chooseDownload(page, 'Download booklet PDF…');
    await expect(page.getByRole('dialog')).toContainText('Download booklet PDF');
    await page.getByLabel('Number of students', { exact: true }).fill(String(copies));
    if (copies === 45) {
      await expect(
        page.getByText('Forms A, B, C repeat in order, one complete copy per student.', {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        page.getByText('One answer key for each form is appended at the end.', { exact: false }),
      ).toBeVisible();
    }
    const exportCount = exports;
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByRole('button', { name: 'Download booklet PDF', exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(new RegExp(`booklet_${copies}_copies\\.pdf$`));
    expect(await download.failure()).toBeNull();
    const downloadedBytes = await fs.readFile(await download.path());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(exports).toBe(exportCount + 1);

    const packet = await PDFDocument.load(downloadedBytes);
    let copyStart = 0;
    for (let copy = 0; copy < copies; copy++) {
      expect(packet.getPage(copyStart + 1).getSize()).toEqual({ width: 400, height: 600 });
      copyStart += pageCounts[copy % pageCounts.length] + 1;
    }
    expect(packet.getPageCount()).toBe(
      copyStart + answerKeyPageCounts.reduce((total, count) => total + count, 0),
    );
    for (const answerKeyPage of packet.getPages().slice(copyStart)) {
      expect(answerKeyPage.getSize()).toEqual({ width: 612, height: 792 });
    }
  }
  const reusedExports = exports;
  const reused = page.waitForEvent('download', { timeout: 120_000 });
  await chooseDownload(page, 'Download booklet PDF…');
  await page.getByRole('button', { name: 'Download booklet PDF', exact: true }).click();
  expect(await (await reused).failure()).toBeNull();
  expect(exports).toBe(reusedExports + 1);
  await page.getByRole('button', { name: 'Student copy', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await page
    .getByRole('combobox', { name: 'Preview form', exact: true })
    .selectOption({ label: 'Form B' });
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toHaveValue('full');
  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'invalid-cover.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('invalid PDF'),
  });
  await chooseDownload(page, 'Download booklet PDF…');
  await page.getByRole('button', { name: 'Download booklet PDF', exact: true }).click();
  await expect(page.getByText(/valid PDF without password protection/)).toHaveCount(1);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Remove cover invalid-cover.pdf', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled();
});

test('distinguishes paper review flags from broken questions omitted from the document', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam23-printing',
  });
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableExams.list'),
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
  );
  await instancesLoaded;
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(page.getByText('Review printability', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText('Omitted', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(downloadMenu(page)).toBeDisabled();
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
});

test('protects pending preview settings and shows a PDF export error once', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
  );
  await page.getByLabel('Additional student information').fill('Section');
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  const downloadButton = downloadMenu(page);
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  const updatePreview = page.getByRole('button', { name: 'Update preview', exact: true });
  await expect(updatePreview).toBeDisabled();
  await page.getByLabel('Additional student information').fill('Room');
  await expect(updatePreview).toBeEnabled();
  await page.getByLabel('Additional student information').fill('Section');
  await expect(updatePreview).toBeDisabled();
  // Whitespace is normalized on submit, so applying it refreshes the same preview settings.
  await page.getByLabel('Additional student information').fill(' Section ');
  await expect(updatePreview).toBeEnabled();
  const requested = withResolvers<undefined>();
  const resume = withResolvers<undefined>();
  await page.route('**/assessment_instance/*/paper?*', async (route) => {
    requested.resolve(undefined);
    await resume.promise;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await requested.promise;
  try {
    await expect(page.getByLabel('Additional student information')).toBeDisabled();
    await expect(page.getByLabel('Paper size')).toBeDisabled();
    await expect(page.getByLabel('Spacing for question 1', { exact: true })).toBeDisabled();
    await expect(
      page.getByRole('checkbox', { name: 'Include question 1', exact: true }),
    ).toBeDisabled();
  } finally {
    resume.resolve(undefined);
  }
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await page.unroute('**/assessment_instance/*/paper?*');
  await expect(page.getByLabel('Additional student information')).toHaveValue('Section');
  await page.getByLabel('Additional student information').fill('Room');
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByLabel('Additional student information')).toHaveValue('Room');
  await expect(updatePreview).toBeDisabled();
  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'invalid-cover.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('invalid PDF'),
  });
  await chooseDownload(page, 'Download Form A (PDF)');
  await expect(page.getByText(/valid PDF without password protection/)).toHaveCount(1);
  await expect(downloadButton).toBeEnabled();
});

test('validates booklet counts and preserves preview recovery after a failed download', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
  );
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await chooseDownload(page, 'Download booklet PDF…');
  const modal = page.getByRole('dialog', { name: 'Download booklet PDF', exact: true });
  const students = modal.getByLabel('Number of students', { exact: true });
  const submit = modal.getByRole('button', { name: 'Download booklet PDF', exact: true });
  await expect(students).toBeFocused();
  for (const value of ['', '0', '1.5', '501']) {
    await students.fill(value);
    await expect(submit).toBeDisabled();
    await expect(students).toHaveAttribute('aria-invalid', 'true');
    await expect(modal.getByText('Enter a whole number between 1 and 500.')).toBeVisible();
  }
  await students.fill('500');
  await expect(submit).toBeEnabled();
  await page.addScriptTag({ content: axe.source });
  expect((await page.evaluate(async () => await axe.run())).violations).toEqual([]);
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await chooseDownload(page, 'Download booklet PDF…');
  await expect(students).toHaveValue('1');
  await students.fill('2');

  const requested = withResolvers<undefined>();
  const resume = withResolvers<undefined>();
  await page.route('**/printableExamExport.pdf', async (route) => {
    requested.resolve(undefined);
    await resume.promise;
    await route.abort();
  });
  await students.press('Enter');
  await requested.promise;
  try {
    await expect(modal.getByRole('status')).toHaveText('Generating…');
    await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await expect(modal.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
  } finally {
    resume.resolve(undefined);
  }
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeDisabled();
  await page.unroute('**/printableExamExport.pdf');
  await chooseDownload(page, 'Download booklet PDF…');
  const downloaded = page.waitForEvent('download');
  await submit.click();
  expect(await (await downloaded).failure()).toBeNull();
  await expect(downloadMenu(page)).toBeEnabled();
});

test('limits static assessments to one form even when the saved URL selects several', async ({
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
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'exam20-assessmentTools',
    });
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
    );
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
    const instanceIds = new URL(page.url()).searchParams.get('instances')!.split(',');

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
    await page.getByRole('button', { name: 'Download booklet PDF…', exact: true }).click();
    await page.getByLabel('Number of students', { exact: true }).fill('2');
    const requested = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith('/printableExamExport.pdf'),
    );
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByRole('button', { name: 'Download booklet PDF', exact: true }).click();
    const request = await requested;
    const input = await new Response(Uint8Array.from(request.postDataBuffer()!), {
      headers: request.headers(),
    }).formData();
    const metadata = PrintPacketMetadataSchema.parse(JSON.parse(input.get('metadata')!.toString()));
    expect(metadata.instances).toHaveLength(1);
    expect(metadata.instances[0]).toMatchObject({
      assessmentInstanceId: instanceIds[0],
      formLabel: 'A',
    });
    expect(metadata.copies).toBe(2);
    expect(await (await downloaded).failure()).toBeNull();
  } finally {
    await fs.writeFile(assessmentFile, originalAssessment);
    await fs.writeFile(questionFile, originalQuestion);
    await syncCourse(testCoursePath);
  }
});

test('can omit the default cover in previews and every download while keeping custom covers', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
  );
  const includeCover = page.getByRole('checkbox', {
    name: 'Include default cover page',
    exact: true,
  });
  await expect(includeCover).toBeChecked();
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
  const pageCountWithCover = await frame.locator('.pagedjs_page').count();
  await page.getByLabel('Additional student information').fill('Room');
  await includeCover.uncheck();
  await expect(page.getByLabel('Additional student information')).toHaveCount(0);
  await expect(downloadMenu(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator('.exam-cover')).toHaveCount(0);
  await expect(frame.locator('.pagedjs_page')).toHaveCount(pageCountWithCover - 1);
  await expect(
    frame.locator('.pagedjs_page').first().locator('.printing-question').first(),
  ).toBeVisible();
  await expect(
    frame.getByRole('img', { name: 'Page 1 identification code', exact: true }),
  ).toBeVisible();
  const studentPages = pageCountWithCover - 1;
  await includeCover.check();
  await expect(page.getByLabel('Additional student information')).toHaveValue('Room');
  await includeCover.uncheck();
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Answer key', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator('.exam-cover')).toHaveCount(0);
  const answerKeyPages = await frame.locator('.pagedjs_page').count();
  await page.getByRole('button', { name: 'Student copy', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });

  const cover = await PDFDocument.create();
  cover.addPage([400, 600]).drawText('Custom instructions');
  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'instructions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cover.save()),
  });
  const pdfDownload = page.waitForEvent('download', { timeout: 120_000 });
  await chooseDownload(page, 'Download Form A (PDF)');
  const pdf = await PDFDocument.load(await fs.readFile(await (await pdfDownload).path()));
  expect(pdf.getPageCount()).toBe(studentPages + 1);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 400, height: 600 });

  const wordDownload = page.waitForEvent('download', { timeout: 120_000 });
  await chooseDownload(page, 'Download Form A Word (.docx)');
  const word = await unzipper.Open.file(await (await wordDownload).path());
  const xml = (
    await word.files.find((file) => file.path === 'word/document.xml')!.buffer()
  ).toString();
  expect(xml).toContain('Question 1');
  expect(xml).not.toContain('Exam with assessment tools');
  expect(xml).not.toContain('<w:pageBreakBefore/>');

  await chooseDownload(page, 'Download booklet PDF…');
  await page.getByLabel('Number of students', { exact: true }).fill('2');
  const bookletDownload = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Download booklet PDF', exact: true }).click();
  const booklet = await PDFDocument.load(await fs.readFile(await (await bookletDownload).path()));
  expect(booklet.getPageCount()).toBe(2 * (studentPages + 1) + answerKeyPages);
  for (const index of [0, studentPages + 1]) {
    expect(booklet.getPage(index).getSize()).toEqual({ width: 400, height: 600 });
  }

  await includeCover.check();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(frame.getByRole('article', { name: 'Exam cover page', exact: true })).toBeVisible();
  await expect(frame.locator('.pagedjs_page')).toHaveCount(pageCountWithCover);
});

test('lets instructors choose grading and pledge content on the cover', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
  );
  const pledge = page.getByRole('checkbox', {
    name: 'Include academic integrity pledge',
    exact: true,
  });
  const grading = page.getByRole('checkbox', { name: 'Include grading table', exact: true });
  await expect(pledge).toBeChecked();
  await expect(grading).not.toBeChecked();
  await grading.check();
  await pledge.uncheck();
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
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
  await expect(frame.getByRole('region', { name: 'Grading table' })).toHaveCount(0);
});
