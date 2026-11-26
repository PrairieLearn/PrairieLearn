import fs from 'node:fs/promises';
import path from 'node:path';

import { load } from 'cheerio';
import * as unzipper from 'unzipper';

import { syncCourse } from '../../helperCourse.js';
import { createTest, expect } from '../fixtures.js';

import {
  createPrintableForm,
  downloadPrintableWord,
  savePrintSettings,
  waitForPrintablePage,
} from './utils.js';

const test = createTest({ features: { 'printable-assessments': true } });

test('uses the shared footer on cover and question pages', async ({ page, courseInstance }) => {
  test.setTimeout(120_000);
  const { printUrl } = await createPrintableForm(courseInstance, 'exam20-assessmentTools');
  for (const document of ['assessment', 'answer_key']) {
    await page.goto(`${printUrl}/preview?paper_size=Letter&document=${document}`);
    await waitForPrintablePage(page);
    const pages = page.locator('.pagedjs_page');
    const footerContent = await pages.evaluateAll((sheets) =>
      sheets.map((sheet) => {
        const left = sheet.querySelector('.pagedjs_margin-bottom-left .pagedjs_margin-content')!;
        const center = sheet.querySelector(
          '.pagedjs_margin-bottom-center .pagedjs_margin-content',
        )!;
        const right = sheet.querySelector('.pagedjs_margin-bottom-right .pagedjs_margin-content')!;
        return {
          left: getComputedStyle(left, '::after').content,
          center: getComputedStyle(center, '::after').content,
          right: getComputedStyle(right, '::after').content,
        };
      }),
    );
    expect(footerContent.length).toBeGreaterThan(1);
    const separator = '\u00a0\u00a0|\u00a0\u00a0';
    for (const footer of footerContent) {
      expect(footer.left).toContain(`Test Course${separator}Spring 2015`);
      expect(footer.center).toContain('Exam with assessment tools');
      expect(footer.right).toContain(
        document === 'answer_key'
          ? `Answer key${separator}Form A1${separator}Page `
          : `Form A1${separator}Page `,
      );
    }
    await expect(page.getByRole('article', { name: /cover page/ }).locator('footer')).toHaveCount(
      0,
    );
  }
});

test('fills the cover grading table down columns using only included questions', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(180_000);
  const { printUrl: base } = await createPrintableForm(courseInstance, 'exam25-printingAutomated');
  await page.goto(`${base}/preview?paper_size=Letter&grading_table=true&exclude_question=2`);
  await waitForPrintablePage(page);
  const cover = page.getByRole('article', { name: 'Exam cover page' });
  const table = cover.getByRole('region', { name: 'Grading table' });
  await expect(table).toBeVisible();
  const layout = await table.evaluate((element) => {
    const grid = element.querySelector('.assessment-grading-grid')!;
    const bounds = grid.getBoundingClientRect();
    const pageBounds = element
      .closest('.pagedjs_page')!
      .querySelector('.pagedjs_area')!
      .getBoundingClientRect();
    return {
      rows: [...grid.children].map((row) => ({
        text: row.textContent,
        top: row.getBoundingClientRect().top,
        left: row.getBoundingClientRect().left,
        bottom: row.getBoundingClientRect().bottom,
      })),
      bottom: bounds.bottom,
      pageBottom: pageBounds.bottom,
    };
  });
  const numbers = await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions) => [
      ...new Set(questions.map((question) => (question as HTMLElement).dataset.questionNumber)),
    ]);
  expect(layout.rows.map((row) => row.text)).toEqual([...numbers, 'Total']);
  expect(numbers).not.toContain('2');
  expect(layout.rows[1].left).toBe(layout.rows[0].left);
  expect(layout.rows[1].top).toBeGreaterThan(layout.rows[0].top);
  const nextColumn = layout.rows.find((row) => row.left > layout.rows[0].left)!;
  expect(nextColumn.top).toBe(layout.rows[0].top);
  expect(layout.bottom).toBeLessThan(layout.pageBottom);
  expect(layout.pageBottom - layout.bottom).toBeLessThan(50);
  await expect(cover).toHaveCount(1);
});

test('uses the configured honor code for printed pledges when requireHonorCode is false', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  test.setTimeout(120_000);
  const tid = 'exam13-disableHonorCode';
  const infoPath = path.join(
    testCoursePath,
    'courseInstances',
    'Sp15',
    'assessments',
    tid,
    'infoAssessment.json',
  );
  const original = await fs.readFile(infoPath, 'utf8');
  try {
    await fs.writeFile(
      infoPath,
      JSON.stringify({
        ...JSON.parse(original),
        requireHonorCode: false,
        honorCode:
          '## Honor code\n\nI, {{user_name}}, agree to follow the **course collaboration policy**.',
      }),
    );
    await syncCourse(testCoursePath);
    const { printUrl: base, printForm } = await createPrintableForm(courseInstance, tid);
    const search = await savePrintSettings(printForm, { includeHonorCode: true });
    await page.goto(`${base}/preview?${search}`);
    await waitForPrintablePage(page);
    const pledge = page.getByRole('region', { name: 'Honor code' });
    await expect(pledge.getByRole('heading', { name: 'Honor code' })).toHaveCount(1);
    await expect(pledge).toContainText(
      'I, ____________________________, agree to follow the course collaboration policy.',
    );
    await expect(pledge.locator('strong')).toHaveText('course collaboration policy');
    await expect(pledge).not.toContainText('I pledge on my honor');
    const response = await downloadPrintableWord(page, base);
    expect(response.status()).toBe(200);
    const archive = await unzipper.Open.buffer(await response.body());
    const xml = (
      await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
    ).toString();
    const word = load(xml, { xml: true });
    const text = word('w\\:t').text();
    expect(text).toContain(
      'I, ____________________________, agree to follow the course collaboration policy.',
    );
    expect(
      word('w\\:r')
        .filter((_, run) => word(run).find('w\\:t').text() === 'course collaboration policy')
        .find('w\\:b'),
    ).toHaveLength(1);
    expect(text).not.toContain('I pledge on my honor');
  } finally {
    await fs.writeFile(infoPath, original);
    await syncCourse(testCoursePath);
  }
});
