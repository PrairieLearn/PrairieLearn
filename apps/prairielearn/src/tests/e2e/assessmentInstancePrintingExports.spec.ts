import * as unzipper from 'unzipper';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getConfiguredUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface PrintableAssessmentInstanceResponse {
  pdf_url: string;
  answer_key_pdf_url: string;
  docx_url: string;
  warnings: { code: string; message: string; question_number?: string; qid?: string | null }[];
}

test('describes the printable exports and serves each linked document', async ({
  page,
  courseInstance,
}) => {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam1-automaticTestSuite',
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
  const query = 'paper_size=Letter&identity_field=Section&identity_field=Student+ID';

  const response = await page.request.get(`${paperUrl}?${query}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const body = (await response.json()) as PrintableAssessmentInstanceResponse;
  expect(body).toEqual({
    pdf_url: `${paperUrl}/pdf?${query}`,
    answer_key_pdf_url: `${paperUrl}/pdf?${query}&document=answer_key`,
    docx_url: `${paperUrl}/docx?${query}`,
    warnings: expect.any(Array),
  });

  // exam1-automaticTestSuite includes a question whose generate() always throws.
  expect(body.warnings.length).toBeGreaterThan(0);
  for (const warning of body.warnings) {
    expect(warning).toMatchObject({ code: 'broken_variant', question_number: expect.any(String) });
    expect(warning.message).toContain(`Question ${warning.question_number}`);
  }

  await page.goto(`${paperUrl}/preview?${query}`);
  await expect(page.locator('html').first()).toHaveAttribute('data-print-status', 'ready');
  const printedQuestionNumbers = await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions) =>
      questions.map((question) => (question as HTMLElement).dataset.questionNumber),
    );
  for (const warning of body.warnings) {
    expect(printedQuestionNumbers).not.toContain(warning.question_number);
  }

  for (const url of [body.pdf_url, body.answer_key_pdf_url]) {
    const pdfResponse = await page.request.get(url);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()['content-type']).toBe('application/pdf');
    expect(pdfResponse.headers()['content-disposition']).toMatch(/^inline; filename=".+\.pdf"$/);
    expect((await pdfResponse.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  expect(
    (await page.request.get(body.answer_key_pdf_url)).headers()['content-disposition'],
  ).toContain('_answer_key.pdf');

  const docxResponse = await page.request.get(body.docx_url);
  expect(docxResponse.status()).toBe(200);
  expect(docxResponse.headers()['content-type']).toContain(DOCX_CONTENT_TYPE);
  expect(docxResponse.headers()['content-disposition']).toMatch(
    /^attachment; filename=".+_letter\.docx"$/,
  );
  const archive = await unzipper.Open.buffer(await docxResponse.body());
  const documentFile = archive.files.find((file) => file.path === 'word/document.xml');
  expect(documentFile).toBeDefined();
  const documentXml = (await documentFile!.buffer()).toString();
  for (const number of printedQuestionNumbers) expect(documentXml).toContain(`Question ${number}`);
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

test('rejects unknown query parameters and non-exam assessments', async ({
  page,
  courseInstance,
}) => {
  const user = await getConfiguredUser();
  const exam = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam1-automaticTestSuite',
  });
  const examInstanceId = await makeAssessmentInstance({
    assessment: exam,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const paperUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${examInstanceId}/paper`;

  expect((await page.request.get(`${paperUrl}?paper_size=Letter&bogus=1`)).status()).toBe(400);
  expect((await page.request.get(`${paperUrl}?paper_size=Tabloid`)).status()).toBe(400);
  expect(
    (await page.request.get(`${paperUrl}/pdf?paper_size=Letter&document=solutions`)).status(),
  ).toBe(400);
});

test('exports the broad printing fixture with inline, ordering, sketch, and display-only questions', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(120_000);
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam23-printing',
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
  await page.goto(`${paperUrl}/preview?paper_size=Letter`);
  await expect(page.locator('html').first()).toHaveAttribute('data-print-status', 'ready');
  const questionNumbers = await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions) => [
      ...new Set(questions.map((question) => (question as HTMLElement).dataset.questionNumber)),
    ]);
  expect(questionNumbers).toHaveLength(46);

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
  expect(await responseHints.allTextContents()).toContain('number (3 sig figs)');
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
  await expect(sketches).toHaveCount(16);
  for (const sketch of await sketches.all()) {
    await expect(sketch).toHaveAttribute('viewBox', '0 0 800 450');
  }

  const docxResponse = await page.request.get(`${paperUrl}/docx?paper_size=Letter`, {
    timeout: 120_000,
  });
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

  await page.goto(`${paperUrl}/preview?paper_size=Letter&document=answer_key`);
  await expect(page.locator('html').first()).toHaveAttribute('data-print-status', 'ready');
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
  const answerKeyResponse = await page.request.get(
    `${paperUrl}/pdf?paper_size=Letter&document=answer_key`,
    { timeout: 120_000 },
  );
  expect(answerKeyResponse.status()).toBe(200);
  expect((await answerKeyResponse.body()).subarray(0, 5).toString()).toBe('%PDF-');
});
