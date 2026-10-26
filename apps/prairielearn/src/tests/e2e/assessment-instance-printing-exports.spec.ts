import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';
import * as unzipper from 'unzipper';

import type { CourseInstance } from '../../lib/db-types.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';
import {
  createPrintableAssessmentInstance,
  downloadPrintableWord,
  waitForPrintablePage,
} from './utils/printing.js';

// Rendering a preview and an export can exceed Playwright's default 30-second test timeout.
test.describe.configure({ timeout: 180_000 });

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function readWarnings(page: Page) {
  return await page.locator(':root').evaluate(
    (root) =>
      JSON.parse(root.getAttribute('data-print-warnings') ?? '[]') as {
        code: string;
        message: string;
        question_number: string;
        qid?: string | null;
      }[],
  );
}

async function createPrintableAssessment(courseInstance: CourseInstance, tid: string) {
  const assessmentInstanceId = await createPrintableAssessmentInstance(courseInstance.id, tid);
  const printUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}/print`;
  return { printUrl, assessmentInstanceId };
}

test('reports omitted questions and exports the selected Word content', async ({
  page,
  courseInstance,
}) => {
  const { printUrl, assessmentInstanceId } = await createPrintableAssessment(
    courseInstance,
    'exam24-printingOmittedQuestion',
  );
  const query = 'paper_size=Letter&identity_field=Section&identity_field=Student+ID';

  await page.goto(`${printUrl}/preview?${query}`);
  await waitForPrintablePage(page);
  const warnings = await readWarnings(page);
  expect(warnings.map((warning) => warning.code)).toEqual(['broken_variant']);
  for (const warning of warnings) {
    expect(warning).toMatchObject({
      question_number: expect.any(String),
    });
    expect(warning.message).toContain(`Question ${warning.question_number}`);
  }

  const printedQuestionNumbers = await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions) =>
      questions.map((question) => (question as HTMLElement).dataset.questionNumber),
    );
  for (const warning of warnings) {
    expect(printedQuestionNumbers).not.toContain(warning.question_number);
  }

  const incomplete = await downloadPrintableWord(page, printUrl, query);
  expect(incomplete.status()).toBe(400);
  expect((await incomplete.json()).error).toContain('has missing or unprintable questions');

  const noPrintableQuestionsQuery = new URLSearchParams(query);
  for (const number of new Set(printedQuestionNumbers)) {
    noPrintableQuestionsQuery.append('exclude_question', number!);
  }
  const emptyPreview = await page.request.get(`${printUrl}/preview?${noPrintableQuestionsQuery}`);
  expect(emptyPreview.status()).toBe(422);
  expect(await emptyPreview.text()).toContain('No questions could be rendered');

  const retainedQuestionNumber = await page
    .locator('.pagedjs_page .printing-question')
    .filter({ hasText: 'Consider two numbers' })
    .first()
    .getAttribute('data-question-number');
  const excludedQuestionNumber = printedQuestionNumbers.find(
    (number) => number !== retainedQuestionNumber,
  )!;
  const selectedQuery = new URLSearchParams(query);
  selectedQuery.append('exclude_question', excludedQuestionNumber);
  for (const warning of warnings) {
    selectedQuery.append('exclude_question', warning.question_number);
  }
  await page.goto(`${printUrl}/preview?${selectedQuery}`);
  await waitForPrintablePage(page);
  expect(await readWarnings(page)).toEqual([]);
  const documentResponse = await downloadPrintableWord(page, printUrl, String(selectedQuery));
  expect(documentResponse.status()).toBe(200);
  expect(documentResponse.headers()['content-type']).toContain(DOCX_CONTENT_TYPE);
  expect(documentResponse.headers()['content-disposition']).toMatch(
    /^attachment; filename=".+_letter\.docx"$/,
  );
  const archive = await unzipper.Open.buffer(await documentResponse.body());
  const documentFile = archive.files.find((file) => file.path === 'word/document.xml');
  expect(documentFile).toBeDefined();
  const documentXml = (await documentFile!.buffer()).toString();
  for (const number of printedQuestionNumbers.filter(
    (number) => number !== excludedQuestionNumber,
  )) {
    expect(documentXml).toContain(`Question ${number}`);
  }
  expect(documentXml).not.toContain(`Question ${excludedQuestionNumber}`);
  expect(documentXml).toContain('<m:oMath>');
  expect(documentXml).toContain('Consider two numbers');
  expect(documentXml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  for (const label of [
    'Name',
    'Section',
    'Student ID',
    'Date',
    `Form ID ${assessmentInstanceId}`,
  ]) {
    expect(documentXml).toContain(label);
  }
});

test('prints representative controls, editable Word content, and an ordered answer key', async ({
  page,
  courseInstance,
}) => {
  const { printUrl } = await createPrintableAssessment(courseInstance, 'exam23-printing');
  await page.goto(`${printUrl}/preview?paper_size=Letter`);
  await waitForPrintablePage(page);
  const search = new URLSearchParams({ paper_size: 'Letter' });
  for (const warning of await readWarnings(page)) {
    search.append('exclude_question', warning.question_number);
  }

  await page.goto(`${printUrl}/preview?${search}`);
  await waitForPrintablePage(page);
  const questions = page.locator('.pagedjs_page .printing-question');
  await expect(
    questions.locator('math-field, textarea, select, input[type="file"], iframe'),
  ).toHaveCount(0);
  expect(await questions.locator('.printing-response-placeholder').allTextContents()).toContain(
    '3 significant figures',
  );
  await expect(
    questions.getByRole('group', { name: 'Choose only one block from this group', exact: true }),
  ).not.toHaveCount(0);
  await expect(questions.locator('svg.printing-sketch')).not.toHaveCount(0);

  const detailsQuestionNumber = await questions
    .filter({ hasText: 'Use the reference below to enter the number of listed values.' })
    .first()
    .getAttribute('data-question-number');
  const detailsQuestion = page.locator(
    `.pagedjs_page .printing-question[data-question-number="${detailsQuestionNumber}"]`,
  );
  const boxes = detailsQuestion.locator('.printing-details');
  await expect(boxes).toHaveCount(2);
  await expect(detailsQuestion.locator('details')).toHaveCount(0);
  await expect(boxes.first().getByText('Reference values')).toBeVisible();
  await expect(boxes.first().getByText('The values are one and two.')).toBeVisible();
  await expect(boxes.last().getByText('Count both values.')).toBeVisible();
  const figurePage = await detailsQuestion
    .getByText('Reference figure')
    .evaluate((element) =>
      Number(element.closest('.pagedjs_page')?.getAttribute('data-page-number')),
    );
  const detailsPage = await boxes
    .first()
    .evaluate((element) =>
      Number(element.closest('.pagedjs_page')?.getAttribute('data-page-number')),
    );
  expect(detailsPage).toBeGreaterThan(figurePage);
  expect(
    await boxes.first().evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      border: getComputedStyle(element).borderTopStyle,
    })),
  ).toEqual({ background: 'rgb(247, 247, 247)', border: 'solid' });

  const response = await downloadPrintableWord(page, printUrl, String(search));
  expect(response.status()).toBe(200);
  const archive = await unzipper.Open.buffer(await response.body());
  const documentXml = (
    await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
  ).toString();
  expect(documentXml).toContain('Choose only one block from this group');
  expect(documentXml).toContain('Find the derivative');
  expect(documentXml).not.toContain('Solution with indentation');
  for (const text of [
    'Reference values',
    'The values are one and two.',
    'Additional context',
    'Count both values.',
  ]) {
    expect(documentXml).toContain(text);
  }
  expect(documentXml.match(/<w:shd w:fill="F7F7F7"\/>/g)).toHaveLength(2);

  await page.goto(`${printUrl}/preview?${search}&document=answer_key`);
  await waitForPrintablePage(page);
  const answerGroup = page.locator('.pagedjs_page .printing-order-answer-group').first();
  const correct = answerGroup.locator('.pl-order-blocks-correct-answer');
  const distractors = answerGroup.locator('.pl-order-blocks-distractors');
  await expect(correct).toBeVisible();
  await expect(distractors).toBeVisible();
  const correctBounds = await correct.boundingBox();
  const distractorBounds = await distractors.boundingBox();
  expect(distractorBounds!.y).toBeGreaterThanOrEqual(correctBounds!.y + correctBounds!.height);
});

test('refuses incomplete question and answer-key renders and recovers after a correction', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const { printUrl } = await createPrintableAssessment(courseInstance, 'exam20-assessmentTools');
  const serverPath = path.join(testCoursePath, 'questions/addNumbers/server.py');
  const original = await fs.readFile(serverPath, 'utf8');
  try {
    for (const panel of ['question', 'answer']) {
      await fs.writeFile(
        serverPath,
        `${original}\n\ndef render(data, html):\n    if data["panel"] == "${panel}":\n        raise Exception("Deliberately broken printable render")\n    return html\n`,
      );
      await syncCourse(testCoursePath);
      const assessment = await page.request.get(`${printUrl}/preview?paper_size=Letter`);
      expect(assessment.status()).toBe(panel === 'question' ? 500 : 200);
      const answerKey = await page.request.get(
        `${printUrl}/preview?paper_size=Letter&document=answer_key`,
      );
      expect(answerKey.status()).toBe(500);
      expect(await answerKey.text()).toContain('could not be rendered.');
    }
  } finally {
    await fs.writeFile(serverPath, original);
    await syncCourse(testCoursePath);
  }
  await page.goto(`${printUrl}/preview?paper_size=Letter&document=answer_key`);
  await waitForPrintablePage(page);
  await expect(page.getByText('Consider two numbers')).toBeVisible();
});
