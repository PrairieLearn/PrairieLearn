import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';
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

test('reports omitted questions and exports the selected Word content', async ({
  page,
  courseInstance,
}) => {
  const { printUrl, printForm } = await createPrintableForm(
    courseInstance,
    'exam24-printingOmittedQuestion',
  );
  const query = await savePrintSettings(printForm, { identityFields: 'Section\nStudent ID' });

  await page.goto(`${printUrl}/preview?${query}`);
  await waitForPrintablePage(page);
  const warnings = await readWarnings(page);
  expect(warnings.map((warning) => warning.code)).toEqual([
    'broken_variant',
    'unsupported_question_type',
  ]);
  expect(warnings[1].message).toContain('question type that printing does not support');
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

  const incomplete = await downloadPrintableWord(page, printUrl);
  expect(incomplete.status()).toBe(400);
  expect((await incomplete.json()).error).toContain('has missing or unprintable questions');

  const brokenOnlyQuery = new URLSearchParams(query);
  for (const number of new Set(printedQuestionNumbers)) {
    brokenOnlyQuery.append('exclude_question', number!);
  }
  const emptyPreview = await page.request.get(`${printUrl}/preview?${brokenOnlyQuery}`);
  expect(emptyPreview.status()).toBe(200);
  expect(await emptyPreview.text()).toContain('data-print-question-count="0"');

  const retainedQuestionNumber = await page
    .locator('.pagedjs_page .printing-question')
    .filter({ hasText: 'Consider two numbers' })
    .first()
    .getAttribute('data-question-number');
  const excludedQuestionNumber = printedQuestionNumbers.find(
    (number) => number !== retainedQuestionNumber,
  )!;
  const selectedQuery = await savePrintSettings(printForm, {
    excludedQuestions: [
      excludedQuestionNumber,
      ...warnings.map((warning) => warning.question_number),
    ],
  });
  await page.goto(`${printUrl}/preview?${selectedQuery}`);
  await waitForPrintablePage(page);
  expect(await readWarnings(page)).toEqual([]);
  const documentResponse = await downloadPrintableWord(page, printUrl);
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
  for (const label of ['Name', 'Section', 'Student ID', 'Date', 'FORM', printForm.label]) {
    expect(documentXml).toContain(label);
  }
});

test('shows the omitted questions when none can be printed', async ({ page, courseInstance }) => {
  const { printUrl } = await createPrintableForm(courseInstance, 'exam24-printingOmittedQuestion');
  await page.goto(
    `${printUrl}/preview?paper_size=Letter&include_cover=false&exclude_question=1&exclude_question=2`,
  );
  await waitForPrintablePage(page);
  expect((await readWarnings(page)).map((warning) => warning.code)).toEqual([
    'broken_variant',
    'unsupported_question_type',
  ]);
  await expect(page.locator(':root')).toHaveAttribute('data-print-question-count', '0');

  await page.goto(
    `${printUrl}/preview?paper_size=Letter&include_cover=false&exclude_question=1&exclude_question=2&document=answer_key`,
  );
  await waitForPrintablePage(page);
  await expect(page.locator(':root')).toHaveAttribute('data-print-question-count', '0');
});

test('prints representative controls, editable Word content, and an ordered answer key', async ({
  page,
  courseInstance,
}) => {
  const { printUrl, printForm } = await createPrintableForm(
    courseInstance,
    'exam25-printingAutomated',
  );
  const search = await savePrintSettings(printForm, {});
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

  // The drawing's only content is an asynchronously rendered LaTeX label.
  const drawingPixels = await questions
    .filter({ hasText: 'Use the labelled drawing below.' })
    .locator('img.printing-canvas-image')
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      return data.filter((value, index) => index % 4 === 3 && value > 0).length;
    });
  expect(drawingPixels).toBeGreaterThan(0);

  const response = await downloadPrintableWord(page, printUrl);
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
  expect(documentXml.match(/<w:shd\b[^>]*\bw:fill="F7F7F7"[^>]*\/>/g)).toHaveLength(2);

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

test('rejects changed Word source before queuing an export', async ({ page, courseInstance }) => {
  const { printUrl, printForm } = await createPrintableForm(
    courseInstance,
    'exam20-assessmentTools',
  );
  const query = await savePrintSettings(printForm, {});
  await page.goto(`${printUrl}/preview?${query}`);
  await waitForPrintablePage(page);
  await page.evaluate(() => {
    const element = document.getElementById('pl-print-docx-source')!;
    const source = JSON.parse(element.textContent);
    source.html += '<p>Changed after the preview was signed</p>';
    element.textContent = JSON.stringify(source);
  });

  const response = await downloadPrintableWord(page, printUrl);
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain('This print preview has expired or changed');
});

test('preserves literal dollar patterns in Word exports', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const questionPath = path.join(testCoursePath, 'questions/addNumbers/question.html');
  const original = await fs.readFile(questionPath, 'utf8');
  const text = "Dollar patterns: $$, $&, $`, and $'.";
  try {
    await fs.writeFile(questionPath, `${original}\n<pre>${text}</pre>\n`);
    await syncCourse(testCoursePath);
    const { printUrl, printForm } = await createPrintableForm(
      courseInstance,
      'exam20-assessmentTools',
    );
    const query = await savePrintSettings(printForm, {});
    await page.goto(`${printUrl}/preview?${query}`);
    await waitForPrintablePage(page);
    await expect(page.locator('.pagedjs_page').getByText(text, { exact: true })).toBeVisible();

    const response = await downloadPrintableWord(page, printUrl);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain(DOCX_CONTENT_TYPE);
  } finally {
    await fs.writeFile(questionPath, original);
    await syncCourse(testCoursePath);
  }
});

test('omits failed question and answer-key renders and recovers after a correction', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const { printUrl, printForm } = await createPrintableForm(
    courseInstance,
    'exam20-assessmentTools',
  );
  const search = await savePrintSettings(printForm, {});
  const serverPath = path.join(testCoursePath, 'questions/addNumbers/server.py');
  const original = await fs.readFile(serverPath, 'utf8');
  try {
    for (const panel of ['question', 'answer']) {
      await fs.writeFile(
        serverPath,
        `${original}\n\ndef render(data, html):\n    if data["panel"] == "${panel}":\n        raise Exception("Deliberately broken printable render")\n    return html\n`,
      );
      await syncCourse(testCoursePath);
      const assessment = await page.goto(`${printUrl}/preview?paper_size=Letter`);
      expect(assessment!.status()).toBe(200);
      await waitForPrintablePage(page);
      expect((await readWarnings(page)).map((warning) => warning.code)).toEqual(
        panel === 'question' ? ['render_error'] : [],
      );

      const query = `${search}&document=answer_key`;
      const answerKey = await page.goto(`${printUrl}/preview?${query}`);
      expect(answerKey!.status()).toBe(200);
      await waitForPrintablePage(page);
      const warnings = await readWarnings(page);
      expect(warnings).toEqual([
        expect.objectContaining({ code: 'render_error', qid: 'addNumbers' }),
      ]);
      await expect(page.getByText('Consider two numbers')).toHaveCount(0);

      const incomplete = await downloadPrintableWord(page, printUrl, 'answer_key');
      expect(incomplete.status()).toBe(400);
      expect((await incomplete.json()).error).toContain('has missing or unprintable questions');

      const selectedQuery = `${query}&exclude_question=${warnings[0].question_number}`;
      await page.goto(`${printUrl}/preview?${selectedQuery}`);
      await waitForPrintablePage(page);
      expect(await readWarnings(page)).toEqual([]);
    }
  } finally {
    await fs.writeFile(serverPath, original);
    await syncCourse(testCoursePath);
  }
  await page.goto(`${printUrl}/preview?${search}&document=answer_key`);
  await waitForPrintablePage(page);
  expect(await readWarnings(page)).toEqual([]);
  await expect(page.getByText('Consider two numbers')).toBeVisible();
  const recovered = await downloadPrintableWord(page, printUrl, 'answer_key');
  expect(recovered.status()).toBe(200);
});

test('omits questions whose content does not finish loading', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const questions = {
    printingAsyncElements:
      '<pl-question-panel><p>Sketch your answer.</p><pl-xss-safe language="markdown" contents="Markdown with **bold reference text**."></pl-xss-safe></pl-question-panel><pl-excalidraw answers-name="sketch" width="400px" height="200px"></pl-excalidraw>',
    printingStuckElement:
      '<pl-question-panel><p>Stuck element.</p><div data-pl-render-status="pending">Never ready</div></pl-question-panel>',
    printingExternalImage:
      '<pl-question-panel><p>External image.</p><img src="https://example.com/image.png" alt="External"></pl-question-panel>',
  };
  const assessmentPath = path.join(
    testCoursePath,
    'courseInstances/Sp15/assessments/exam99-printingIncomplete',
  );
  const questionPaths = Object.keys(questions).map((qid) =>
    path.join(testCoursePath, 'questions', qid),
  );
  try {
    for (const [qid, questionHtml] of Object.entries(questions)) {
      const questionPath = path.join(testCoursePath, 'questions', qid);
      await fs.mkdir(questionPath, { recursive: true });
      await fs.writeFile(
        path.join(questionPath, 'info.json'),
        JSON.stringify({ uuid: crypto.randomUUID(), title: qid, topic: 'Printing', type: 'v3' }),
      );
      await fs.writeFile(path.join(questionPath, 'question.html'), questionHtml);
    }
    await fs.mkdir(assessmentPath, { recursive: true });
    await fs.writeFile(
      path.join(assessmentPath, 'infoAssessment.json'),
      JSON.stringify({
        uuid: crypto.randomUUID(),
        type: 'Exam',
        title: 'Incomplete printing content',
        set: 'Exam',
        number: '99',
        shuffleQuestions: false,
        zones: [
          {
            // The blank drawing's canvas becomes an image only after the stuck element times out.
            questions: Object.keys(questions).map((id) => ({
              id,
              autoPoints: 1,
            })),
          },
        ],
      }),
    );
    await syncCourse(testCoursePath);

    const { printUrl, printForm } = await createPrintableForm(
      courseInstance,
      'exam99-printingIncomplete',
    );
    const search = await savePrintSettings(printForm, { includeCoverPage: false });
    const response = await page.goto(`${printUrl}/preview?${search}`);
    expect(response!.status()).toBe(200);
    await waitForPrintablePage(page);
    expect(await readWarnings(page)).toEqual([
      expect.objectContaining({
        code: 'incomplete_render',
        question_number: '2',
        message: 'Question 2 has content that did not finish rendering.',
      }),
      expect.objectContaining({
        code: 'incomplete_render',
        question_number: '3',
        message: 'Question 3 uses an image from another website, which printing cannot include.',
      }),
    ]);
    await expect(page.locator(':root')).toHaveAttribute('data-print-question-count', '1');
    await expect(page.locator(':root')).toHaveAttribute('data-print-max-points', '1');
    await expect(page.locator('.printing-excalidraw img.printing-canvas-image')).toHaveCount(1);
    await expect(page.getByText('bold reference text')).toBeVisible();
    await expect(page.getByText('Stuck element.')).toHaveCount(0);

    const download = await downloadPrintableWord(page, printUrl);
    expect(download.status()).toBe(400);
    expect((await download.json()).error).toContain('has missing or unprintable questions');
  } finally {
    await fs.rm(assessmentPath, { recursive: true, force: true });
    for (const questionPath of questionPaths) {
      await fs.rm(questionPath, { recursive: true, force: true });
    }
    await syncCourse(testCoursePath);
  }
});

test('returns a frameable error page when the preview fails', async ({ page, courseInstance }) => {
  const { printUrl } = await createPrintableForm(courseInstance, 'exam25-printingAutomated');
  const response = await page.goto(`${printUrl}/preview?paper_size=Tabloid`);
  expect(response!.status()).toBe(400);
  expect(response!.headers()['x-frame-options']).toBe('SAMEORIGIN');
  await expect(page.locator(':root')).toHaveAttribute('data-print-status', 'error');
  await expect(page.locator(':root')).toHaveAttribute('data-print-error', /.+/);
});
