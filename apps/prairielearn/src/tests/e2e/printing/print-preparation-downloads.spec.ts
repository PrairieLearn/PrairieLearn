import fs from 'node:fs/promises';

import axe from 'axe-core';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';

import { expect } from '../fixtures.js';

import {
  ACTIVE_PREVIEW_FRAME_SELECTOR,
  assessmentFor,
  chooseDownload,
  clearPrintPreparationState,
  downloadMenu,
  downloadPreparedFile,
  openPrintPreparation,
  preparePreview,
  printFormLabel,
  test,
} from './print-preparation-utils.js';

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ courseInstance }) => {
  await clearPrintPreparationState(courseInstance.id);
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
        new URL(response.url()).pathname.endsWith('/printExports.pdf'),
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

test('rejects a changed Word snapshot and offers a fresh preview', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Form B1 Previewing' })).toBeVisible();
  await page.getByRole('button', { name: 'Form A1', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });

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
  await chooseDownload(page, 'Download Form A1 Word (.docx)');
  await expect(
    page.getByRole('alert').getByText('This print preview has expired or changed.'),
  ).toBeVisible();
  await expect(downloadMenu(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Form B1', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Form A1', exact: true }).click();
  await expect(downloadMenu(page)).toBeDisabled();
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
  await expect(page.getByRole('button', { name: /^Form A1(?: Previewing)?$/ })).toBeVisible();
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

test('retries a failed combined PDF download from its modal', async ({ page, courseInstance }) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await chooseDownload(page, 'Download all answer keys PDF');
  const modal = page.getByRole('dialog', { name: 'Download all answer keys PDF', exact: true });
  const submit = modal.getByRole('button', { name: 'Download all answer keys PDF', exact: true });
  await expect(submit).toBeEnabled({ timeout: 120_000 });
  await page.route('**/printExports.pdf', (route) => route.abort(), { times: 1 });
  await submit.click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(submit).toBeEnabled();
  await page.unroute('**/printExports.pdf');

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
