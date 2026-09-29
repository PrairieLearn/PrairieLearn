import fs from 'node:fs/promises';
import path from 'node:path';

import * as unzipper from 'unzipper';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { syncCourse } from '../helperCourse.js';
import { getConfiguredUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForPrintablePage } from './utils/printing.js';

test('fills the cover grading table down columns using only included questions', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(180_000);
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam23-printing',
  });
  const user = await getConfiguredUser();
  const instanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const base = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${instanceId}/paper`;
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
  const response = await page.request.get(
    `${base}/docx?paper_size=Letter&grading_table=true&exclude_question=2`,
    { timeout: 120_000 },
  );
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
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam13-disableHonorCode',
  });
  const user = await getConfiguredUser();
  const instanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const base = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${instanceId}/paper`;
  for (const enabled of [true, false]) {
    await page.goto(`${base}/preview?paper_size=Letter&include_honor_code=${enabled}`);
    await waitForPrintablePage(page);
    await expect(page.getByRole('heading', { name: 'Academic integrity pledge' })).toHaveCount(
      enabled ? 1 : 0,
    );
    const response = await page.request.get(
      `${base}/docx?paper_size=Letter&include_honor_code=${enabled}`,
      { timeout: 120_000 },
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
    const assessment = await selectAssessmentByTid({ course_instance_id: courseInstance.id, tid });
    const user = await getConfiguredUser();
    const instanceId = await makeAssessmentInstance({
      assessment,
      user_id: user.id,
      authn_user_id: user.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
    });
    const base = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${instanceId}/paper`;
    await page.goto(`${base}/preview?paper_size=Letter&include_honor_code=true`);
    await waitForPrintablePage(page);
    const pledge = page.getByRole('region', { name: 'Academic integrity pledge' });
    await expect(pledge.getByRole('heading', { name: 'Academic integrity pledge' })).toHaveCount(1);
    await expect(pledge).toContainText(
      'I, ____________________________, agree to follow the course collaboration policy.',
    );
    await expect(pledge.locator('strong')).toHaveText('course collaboration policy');
    await expect(pledge).not.toContainText('I pledge on my honor');
    const response = await page.request.get(
      `${base}/docx?paper_size=Letter&include_honor_code=true`,
      { timeout: 120_000 },
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
