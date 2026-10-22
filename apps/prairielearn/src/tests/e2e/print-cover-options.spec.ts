import fs from 'node:fs/promises';
import path from 'node:path';

import * as unzipper from 'unzipper';

import { syncCourse } from '../helperCourse.js';

import { createTest, expect } from './fixtures.js';
import {
  createPrintableAssessmentInstance,
  downloadPrintableWord,
  waitForPrintablePage,
} from './utils/printing.js';

const test = createTest({ features: { 'printable-exams': true } });

async function paperBase(courseInstanceId: string, tid: string) {
  const instanceId = await createPrintableAssessmentInstance(courseInstanceId, tid);
  return `/pl/course_instance/${courseInstanceId}/instructor/assessment_instance/${instanceId}/paper`;
}

test('fills the cover grading table down columns using only included questions', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(180_000);
  const base = await paperBase(courseInstance.id, 'exam23-printing');
  for (const paperSize of ['Letter', 'A4']) {
    await page.goto(
      `${base}/preview?paper_size=${paperSize}&grading_table=true&exclude_question=2`,
    );
    await waitForPrintablePage(page);
    const cover = page.getByRole('article', { name: 'Exam cover page' });
    const table = cover.getByRole('region', { name: 'Grading table' });
    await expect(table).toBeVisible();
    const layout = await table.evaluate((element) => {
      const grid = element.querySelector('.exam-grading-grid')!;
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
  }
  const warnings = await page.locator(':root').evaluate(
    (root) =>
      JSON.parse(root.getAttribute('data-print-warnings') ?? '[]') as {
        qid: string | null;
        question_number: string;
      }[],
  );
  expect(warnings.map((warning) => warning.qid)).toEqual(
    expect.arrayContaining(['brokenGeneration', 'brokenPrepare']),
  );
  const search = new URLSearchParams({
    paper_size: 'Letter',
    grading_table: 'true',
    exclude_question: '2',
  });
  for (const warning of warnings) search.append('exclude_question', warning.question_number);
  await page.goto(`${base}/preview?${search}`);
  await waitForPrintablePage(page);
  const response = await downloadPrintableWord(page, base, String(search));
  expect(response.status()).toBe(200);
  const archive = await unzipper.Open.buffer(await response.body());
  const xml = (
    await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
  ).toString();
  expect(xml).toContain('Total   __________');
  expect(xml).toContain('1   __________');
  expect(xml).not.toMatch(/<w:t[^>]*>2 {3}__________<\/w:t>/);
  for (const query of [
    'document=answer_key&grading_table=true',
    'include_cover=false&grading_table=true',
    'grading_table=false',
  ]) {
    await page.goto(`${base}/preview?paper_size=Letter&${query}`);
    await waitForPrintablePage(page);
    await expect(page.getByRole('region', { name: 'Grading table' })).toHaveCount(0);
  }
});

test('can enable or disable the printed pledge independently of online assessment requirements', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(120_000);
  const base = await paperBase(courseInstance.id, 'exam13-disableHonorCode');
  for (const enabled of [true, false]) {
    await page.goto(`${base}/preview?paper_size=Letter&include_honor_code=${enabled}`);
    await waitForPrintablePage(page);
    await expect(page.getByRole('heading', { name: 'Academic integrity pledge' })).toHaveCount(
      enabled ? 1 : 0,
    );
    const response = await downloadPrintableWord(
      page,
      base,
      `paper_size=Letter&include_honor_code=${enabled}`,
    );
    expect(response.status()).toBe(200);
    const archive = await unzipper.Open.buffer(await response.body());
    const xml = (
      await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
    ).toString();
    expect(xml.includes('Academic integrity pledge')).toBe(enabled);
    expect(xml.includes('Signature')).toBe(enabled);
  }
});

test('uses the configured honor code for printed pledges even when it is disabled online', async ({
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
          '## Academic integrity pledge\n\nI, {{user_name}}, agree to follow the **course collaboration policy**.',
      }),
    );
    await syncCourse(testCoursePath);
    const base = await paperBase(courseInstance.id, tid);
    await page.goto(`${base}/preview?paper_size=Letter&include_honor_code=true`);
    await waitForPrintablePage(page);
    const pledge = page.getByRole('region', { name: 'Academic integrity pledge' });
    await expect(pledge.getByRole('heading', { name: 'Academic integrity pledge' })).toHaveCount(1);
    await expect(pledge).toContainText(
      'I, ____________________________, agree to follow the course collaboration policy.',
    );
    await expect(pledge.locator('strong')).toHaveText('course collaboration policy');
    await expect(pledge).not.toContainText('I pledge on my honor');
    const response = await downloadPrintableWord(
      page,
      base,
      'paper_size=Letter&include_honor_code=true',
    );
    expect(response.status()).toBe(200);
    const archive = await unzipper.Open.buffer(await response.body());
    const xml = (
      await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
    ).toString();
    expect(xml).toContain(
      'I, ____________________________, agree to follow the course collaboration policy.',
    );
    expect(xml).not.toContain('I pledge on my honor');
  } finally {
    await fs.writeFile(infoPath, original);
    await syncCourse(testCoursePath);
  }
});
