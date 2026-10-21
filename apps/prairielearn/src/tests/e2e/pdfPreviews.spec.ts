import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } from '../../lib/paths.js';
import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

async function uploadPdf(page: Page) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Drop files here or click to upload/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'test.pdf',
    mimeType: 'application/pdf',
    buffer: await fs.readFile(
      path.join(
        EXAMPLE_COURSE_PATH,
        'questions/demo/fileDownloadUpload/clientFilesQuestion/Prompt.pdf',
      ),
    ),
  });
}

async function canFetchUrl(page: Page, url: string) {
  return page.evaluate(async (url) => {
    try {
      return (await fetch(url)).ok;
    } catch {
      return false;
    }
  }, url);
}

test.beforeEach(async ({ page, courseInstance, testCoursePath }) => {
  const questionPath = path.join(testCoursePath, 'questions/manualGrade/codeUpload/question.html');
  const html = await fs.readFile(questionPath, 'utf8');
  await fs.writeFile(questionPath, html.replace('file-names="fib.py"', 'file-patterns="*.pdf"'));
  await syncCourse(testCoursePath);
  const question = await selectQuestionByQid({
    qid: 'manualGrade/codeUpload',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
});

test.afterEach(async ({ testCoursePath }) => {
  const questionPath = 'questions/manualGrade/codeUpload/question.html';
  await fs.copyFile(
    path.join(TEST_COURSE_PATH, questionPath),
    path.join(testCoursePath, questionPath),
  );
  await syncCourse(testCoursePath);
});

test('keeps upload PDF URLs usable until replacement or deletion', async ({ page }) => {
  await uploadPdf(page);
  const upload = page.locator('.pl-file-upload-container');
  const pdf = upload.getByLabel('PDF file preview');
  await expect(pdf).toBeVisible();
  await expect(pdf).toHaveAttribute('data', /^blob:/);
  const firstUrl = (await pdf.getAttribute('data'))!;

  // Safari renders without load; other browsers fire it. Neither should release the URL.
  await pdf.dispatchEvent('load');
  expect(await canFetchUrl(page, firstUrl)).toBe(true);
  await upload.locator('.file-preview-button').click();
  await expect(pdf).toBeHidden();
  expect(await canFetchUrl(page, firstUrl)).toBe(true);
  await upload.locator('.file-preview-button').click();
  await expect(pdf).toBeVisible();
  await expect(pdf).toHaveAttribute('data', firstUrl);

  await uploadPdf(page);
  await expect(pdf).not.toHaveAttribute('data', firstUrl);
  await expect.poll(() => canFetchUrl(page, firstUrl)).toBe(false);
  const replacementUrl = (await pdf.getAttribute('data'))!;
  expect(await canFetchUrl(page, replacementUrl)).toBe(true);

  await upload.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(pdf).toHaveCount(0);
  await expect.poll(() => canFetchUrl(page, replacementUrl)).toBe(false);
});

test('keeps submitted PDF URLs usable until their panel is removed', async ({ page }) => {
  await uploadPdf(page);
  const uploadPdfPreview = page.locator('.pl-file-upload-container').getByLabel('PDF file preview');
  await expect(uploadPdfPreview).toHaveAttribute('data', /^blob:/);
  const uploadUrl = (await uploadPdfPreview.getAttribute('data'))!;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => canFetchUrl(page, uploadUrl)).toBe(false);

  const submission = page.getByTestId('submission-with-feedback').first();
  await submission.getByRole('button', { name: 'Show preview', exact: true }).click();
  const pdf = submission.getByLabel('PDF file preview');
  await expect(pdf).toBeVisible();
  await expect(pdf).toHaveAttribute('data', /^blob:/);
  const url = (await pdf.getAttribute('data'))!;
  const content = await page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    return { type: blob.type, signature: (await blob.text()).slice(0, 5) };
  }, url);
  expect(content).toEqual({ type: 'application/pdf', signature: '%PDF-' });

  await pdf.dispatchEvent('load');
  await expect(submission.locator('.file-preview')).toHaveClass(/\bshow\b/);
  await submission.getByRole('button', { name: 'Hide preview', exact: true }).click();
  await expect(pdf).toBeHidden();
  expect(await canFetchUrl(page, url)).toBe(true);
  await submission.getByRole('button', { name: 'Show preview', exact: true }).click();
  await expect(pdf).toBeVisible();
  await expect(pdf).toHaveAttribute('data', url);

  // Reparenting a connected preview must not release its URL.
  await pdf.evaluate((element) => element.parentElement!.append(element));
  expect(await canFetchUrl(page, url)).toBe(true);

  const downloadPromise = page.waitForEvent('download');
  await submission.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('test.pdf');
  expect((await fs.readFile(await download.path())).subarray(0, 5).toString()).toBe('%PDF-');

  await submission.evaluate((element) => element.remove());
  await expect.poll(() => canFetchUrl(page, url)).toBe(false);
});
