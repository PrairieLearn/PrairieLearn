import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';
import * as unzipper from 'unzipper';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import type { CourseInstance } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { syncCourse } from '../helperCourse.js';
import { getConfiguredUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { downloadPrintableWord, waitForPrintablePage } from './utils/printing.js';

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

async function createPrintableExam(courseInstance: CourseInstance, tid: string) {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid,
  });
  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const paperUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}/paper`;
  return { paperUrl, assessmentInstanceId };
}

test('reports omitted questions and exports the selected Word content', async ({
  page,
  courseInstance,
}) => {
  const { paperUrl, assessmentInstanceId } = await createPrintableExam(
    courseInstance,
    'exam1-automaticTestSuite',
  );
  const query = 'paper_size=Letter&identity_field=Section&identity_field=Student+ID';

  await page.goto(`${paperUrl}/preview?${query}`);
  await waitForPrintablePage(page);
  const warnings = await readWarnings(page);
  // exam1-automaticTestSuite includes a question whose generate() always throws.
  expect(warnings.length).toBeGreaterThan(0);
  for (const warning of warnings) {
    expect(warning).toMatchObject({
      code: 'broken_variant',
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

  const incomplete = await downloadPrintableWord(page, paperUrl, query);
  expect(incomplete.status()).toBe(400);
  expect((await incomplete.json()).error).toContain('has missing or unprintable questions');

  const brokenOnlyQuery = new URLSearchParams(query);
  for (const number of new Set(printedQuestionNumbers)) {
    brokenOnlyQuery.append('exclude_question', number!);
  }
  const emptyPreview = await page.request.get(`${paperUrl}/preview?${brokenOnlyQuery}`);
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
  await page.goto(`${paperUrl}/preview?${selectedQuery}`);
  await waitForPrintablePage(page);
  expect(await readWarnings(page)).toEqual([]);
  const documentResponse = await downloadPrintableWord(page, paperUrl, String(selectedQuery));
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

test('prints details content in visible boxes and preserves it in Word', async ({
  page,
  courseInstance,
}) => {
  const { paperUrl } = await createPrintableExam(courseInstance, 'exam26-printingDetails');
  await page.goto(`${paperUrl}/preview?paper_size=Letter`);
  await waitForPrintablePage(page);

  const boxes = page.locator('.pagedjs_page .printing-question .printing-details');
  await expect(boxes).toHaveCount(2);
  await expect(page.locator('.pagedjs_page .printing-question details')).toHaveCount(0);
  await expect(boxes.first().getByText('Reference values')).toBeVisible();
  await expect(boxes.first().getByText('The values are one and two.')).toBeVisible();
  await expect(boxes.last().getByText('Count both values.')).toBeVisible();
  const figurePage = await page
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

  const response = await downloadPrintableWord(page, paperUrl, 'paper_size=Letter');
  expect(response.status()).toBe(200);
  const archive = await unzipper.Open.buffer(await response.body());
  const documentFile = archive.files.find((file) => file.path === 'word/document.xml');
  expect(documentFile).toBeDefined();
  const documentXml = (await documentFile!.buffer()).toString();
  for (const text of [
    'Reference values',
    'The values are one and two.',
    'Additional context',
    'Count both values.',
  ]) {
    expect(documentXml).toContain(text);
  }
  expect(documentXml.match(/<w:shd w:fill="F7F7F7"\/>/g)).toHaveLength(2);
});

test('previews and exports an exam with more than 64 figures', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const questionPath = path.join(testCoursePath, 'questions/printingDetails/question.html');
  const original = await fs.readFile(questionPath, 'utf8');
  const figures = Array.from(
    { length: 65 },
    (_, index) =>
      `<svg width="12" height="12" viewBox="0 0 12 12" aria-label="Figure ${index + 1}"><circle cx="6" cy="6" r="5" /></svg>`,
  ).join('');
  try {
    await fs.writeFile(
      questionPath,
      original.replace('</pl-question-panel>', `${figures}</pl-question-panel>`),
    );
    await syncCourse(testCoursePath);
    const { paperUrl } = await createPrintableExam(courseInstance, 'exam26-printingDetails');
    await page.goto(`${paperUrl}/preview?paper_size=Letter`);
    await waitForPrintablePage(page);
    const source = await page
      .locator('#pl-print-docx-source')
      .evaluate((element) => JSON.parse(element.textContent));
    expect(source.figures.length).toBeGreaterThan(64);

    const response = await downloadPrintableWord(page, paperUrl, 'paper_size=Letter');
    expect(response.status()).toBe(200);
  } finally {
    await fs.writeFile(questionPath, original);
    await syncCourse(testCoursePath);
  }
});

test('rejects invalid print query parameters', async ({ page, courseInstance }) => {
  const { paperUrl } = await createPrintableExam(courseInstance, 'exam1-automaticTestSuite');

  expect((await page.request.get(`${paperUrl}/preview?paper_size=Letter&bogus=1`)).status()).toBe(
    400,
  );
  expect((await page.request.get(`${paperUrl}/preview?paper_size=Tabloid`)).status()).toBe(400);
  expect(
    (await page.request.get(`${paperUrl}/preview?paper_size=Letter&document=solutions`)).status(),
  ).toBe(400);
});

test('rejects invalid question exclusions in previews', async ({ page, courseInstance }) => {
  const { paperUrl } = await createPrintableExam(courseInstance, 'exam20-assessmentTools');
  for (const exclusion of [
    'exclude_question=1&exclude_question=1',
    'exclude_question=99',
    'exclude_question=1&exclude_question=2',
  ]) {
    const response = await page.request.get(`${paperUrl}/preview?paper_size=Letter&${exclusion}`);
    expect(response.status()).toBe(400);
  }
});

test('exports the broad printing fixture with inline, ordering, sketch, and display-only questions', async ({
  page,
  courseInstance,
}) => {
  const { paperUrl } = await createPrintableExam(courseInstance, 'exam23-printing');
  await page.goto(`${paperUrl}/preview?paper_size=Letter`);
  await waitForPrintablePage(page);
  const warnings = await readWarnings(page);
  expect(warnings.map((warning) => warning.qid)).toEqual(
    expect.arrayContaining(['brokenGeneration', 'brokenPrepare']),
  );
  const search = new URLSearchParams({ paper_size: 'Letter' });
  for (const warning of warnings) search.append('exclude_question', warning.question_number);
  await page.goto(`${paperUrl}/preview?${search}`);
  await waitForPrintablePage(page);
  const questionNumbers = await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions) => [
      ...new Set(questions.map((question) => (question as HTMLElement).dataset.questionNumber)),
    ]);
  expect(questionNumbers).toHaveLength(48 - warnings.length);

  const questions = page.locator('.pagedjs_page .printing-question');
  await expect(
    questions.locator(
      'math-field, textarea, select, input[type="range"], input[type="file"], iframe, .image-capture-card, .si-toolbar',
    ),
  ).toHaveCount(0);
  const responseHints = questions.locator('.printing-response-placeholder');
  await expect(
    responseHints.filter({ hasText: /^(symbolic expression|asymptotic expression|integer)$/i }),
  ).toHaveCount(0);
  expect(await responseHints.allTextContents()).toContain('3 significant figures');
  expect(await responseHints.allTextContents()).toContain('symbolic expression (blank is allowed)');
  const displayQuestion = questions.filter({
    has: page.locator('[data-print-answer-name="number_block"]'),
  });
  expect(
    await displayQuestion
      .getByRole('heading', { name: 'pl-number-input', exact: true })
      .evaluate((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
  ).toBeLessThanOrEqual(15);
  const matrixLines = questions.locator(
    '.pl-matrix-component-input-container [data-print-response-line]',
  );
  await expect(matrixLines).toHaveCount(4);
  for (const line of await matrixLines.all()) {
    expect(await line.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(
      50,
    );
  }
  await expect(
    questions.locator(
      '.printing-keep-together[data-split-from], .printing-keep-together[data-split-to]',
    ),
  ).toHaveCount(0);
  const multipleChoiceSections = page.locator(
    '.pagedjs_page [data-question-number="15"] .printing-subsection',
  );
  await expect(multipleChoiceSections).toHaveCount(5);
  const drawingSections = page.locator(
    '.pagedjs_page [data-question-number="39"] .printing-subsection, .pagedjs_page [data-question-number="40"] .printing-subsection',
  );
  await expect(drawingSections).toHaveCount(6);
  for (const section of await drawingSections.all()) {
    await expect(section.locator('p')).toHaveCount(1);
    await expect(section.locator('.printing-drawing-response')).toHaveCount(1);
  }
  for (const section of [
    ...(await multipleChoiceSections.all()),
    ...(await drawingSections.all()),
  ]) {
    const overflow = await section.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const pageBounds = element
        .closest('.pagedjs_page')!
        .querySelector('.pagedjs_area')!
        .getBoundingClientRect();
      return Math.max(pageBounds.top - bounds.top, bounds.bottom - pageBounds.bottom);
    });
    expect(overflow).toBeLessThanOrEqual(1);
  }
  const blockChoices = questions.getByRole('group', {
    name: 'Choose only one block from this group',
    exact: true,
  });
  await expect(blockChoices).toHaveCount(4);
  for (const group of await blockChoices.all()) {
    await expect(
      group.getByText('Choose only one block from this group', { exact: true }),
    ).toHaveCount(1);
    await expect(group.getByRole('listitem')).toHaveCount(3);
    await expect(group.getByLabel('Order number', { exact: true })).toHaveCount(3);
  }
  await expect(questions.getByText(/Alternative group/)).toHaveCount(0);
  await expect(questions.locator('.printing-order-source ol')).toHaveCount(0);
  for (const position of await questions.getByLabel('Order number', { exact: true }).all()) {
    await expect(position).toBeEmpty();
    const bounds = await position.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(28);
    expect(bounds!.height).toBeGreaterThanOrEqual(28);
  }
  const indentFields = questions.getByLabel('Indentation level', { exact: true });
  expect(await indentFields.count()).toBeGreaterThan(0);
  for (const field of await indentFields.all()) await expect(field).toBeEmpty();
  await expect(questions.getByText('Solution with indentation', { exact: true })).toHaveCount(0);
  const checkboxOptions = page.locator('[data-question-number="14"] .printing-selection-option');
  await expect(checkboxOptions).toHaveCount(3);
  for (const option of await checkboxOptions.all()) {
    const spacing = await option.evaluate((element) => {
      const style = getComputedStyle(element);
      return { padding: Number.parseFloat(style.paddingTop), align: style.alignItems };
    });
    expect(spacing.padding).toBeGreaterThanOrEqual(8);
    expect(spacing.align).toBe('flex-start');
  }
  const textareaLines = page.locator(
    '.pagedjs_page [data-question-number="35"] .printing-response-lines',
  );
  const textareaBounds = await textareaLines.boundingBox();
  expect(textareaBounds!.width).toBeGreaterThan(600);
  const sketches = questions.locator('svg.printing-sketch');
  await expect(sketches).toHaveCount(17);
  for (const sketch of await sketches.all()) {
    await expect(sketch).toHaveAttribute('viewBox', '0 0 800 450');
  }

  const docxResponse = await downloadPrintableWord(page, paperUrl, String(search));
  expect(docxResponse.status()).toBe(200);
  const archive = await unzipper.Open.buffer(await docxResponse.body());
  const documentXml = (
    await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
  ).toString();
  for (const number of questionNumbers) expect(documentXml).toContain(`Question ${number}`);
  expect(documentXml.match(/<m:oMath>/g)?.length).toBeGreaterThan(100);
  expect(documentXml).toContain('Choose only one block from this group');
  expect(documentXml).toContain('Indent');
  expect(documentXml).not.toContain('Solution with indentation');
  expect(documentXml).toContain('Find the derivative');
  expect(documentXml).not.toContain('PrintedQuestionImage');
  expect(documentXml).toContain('w:hRule="atLeast"');
});

test('exports the broad answer key with correct answers before distractors', async ({
  page,
  courseInstance,
}) => {
  const { paperUrl } = await createPrintableExam(courseInstance, 'exam23-printing');
  await page.goto(`${paperUrl}/preview?paper_size=Letter`);
  await waitForPrintablePage(page);
  const warnings = await readWarnings(page);
  expect(warnings.map((warning) => warning.qid)).toEqual(
    expect.arrayContaining(['brokenGeneration', 'brokenPrepare']),
  );
  const search = new URLSearchParams({ paper_size: 'Letter' });
  for (const warning of warnings) search.append('exclude_question', warning.question_number);
  await page.goto(`${paperUrl}/preview?${search}`);
  await waitForPrintablePage(page);
  const questionNumbers = await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions) => [
      ...new Set(questions.map((question) => (question as HTMLElement).dataset.questionNumber)),
    ]);
  expect(questionNumbers).toHaveLength(48 - warnings.length);
  await page.goto(`${paperUrl}/preview?${search}&document=answer_key`);
  await waitForPrintablePage(page);
  const answerQuestionNumbers = await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions) => [
      ...new Set(
        questions
          .filter((question) => question.querySelector('[data-print-answer-key]'))
          .map((question) => (question as HTMLElement).dataset.questionNumber),
      ),
    ]);
  expect(answerQuestionNumbers).toEqual(questionNumbers);
  const orderAnswerGroups = page.locator('.pagedjs_page .printing-order-answer-group');
  await expect(orderAnswerGroups).toHaveCount(5);
  for (const group of await orderAnswerGroups.all()) {
    const correct = group.locator('.pl-order-blocks-answer-container:has(> .bg-success-subtle)');
    const incorrect = group.locator('.pl-order-blocks-answer-container:has(> .bg-danger-subtle)');
    await expect(correct).toHaveCount(1);
    await expect(incorrect).toHaveCount(1);
    const correctBounds = await correct.boundingBox();
    const incorrectBounds = await incorrect.boundingBox();
    expect(incorrectBounds!.y).toBeGreaterThanOrEqual(correctBounds!.y + correctBounds!.height);
    const overflow = await group.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const pageBounds = element
        .closest('.pagedjs_page')!
        .querySelector('.pagedjs_area')!
        .getBoundingClientRect();
      return Math.max(pageBounds.top - bounds.top, bounds.bottom - pageBounds.bottom);
    });
    expect(overflow).toBeLessThanOrEqual(1);
  }
  expect(
    await page
      .locator('.printing-answer-key-content')
      .evaluateAll((answers) =>
        answers.every((answer) => getComputedStyle(answer).transform === 'none'),
      ),
  ).toBe(true);
  const answerKeyResponse = await downloadPrintableWord(
    page,
    paperUrl,
    `${search}&document=answer_key`,
  );
  expect(answerKeyResponse.status()).toBe(200);
});

test('refuses incomplete question and answer-key renders and recovers after a correction', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const { paperUrl } = await createPrintableExam(courseInstance, 'exam20-assessmentTools');
  const serverPath = path.join(testCoursePath, 'questions/addNumbers/server.py');
  const original = await fs.readFile(serverPath, 'utf8');
  try {
    for (const panel of ['question', 'answer']) {
      await fs.writeFile(
        serverPath,
        `${original}\n\ndef render(data, html):\n    if data["panel"] == "${panel}":\n        raise Exception("Deliberately broken printable render")\n    return html\n`,
      );
      await syncCourse(testCoursePath);
      const exam = await page.request.get(`${paperUrl}/preview?paper_size=Letter`);
      expect(exam.status()).toBe(panel === 'question' ? 500 : 200);
      const answerKey = await page.request.get(
        `${paperUrl}/preview?paper_size=Letter&document=answer_key`,
      );
      expect(answerKey.status()).toBe(500);
      expect(await answerKey.text()).toContain('could not be rendered for printing');
    }
  } finally {
    await fs.writeFile(serverPath, original);
    await syncCourse(testCoursePath);
  }
  await page.goto(`${paperUrl}/preview?paper_size=Letter&document=answer_key`);
  await waitForPrintablePage(page);
  await expect(page.getByText('Consider two numbers')).toBeVisible();
});
