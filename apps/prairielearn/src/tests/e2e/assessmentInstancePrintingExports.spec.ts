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
  const pageCount = await page.locator('.pagedjs_page').count();
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
  const mediaFiles = archive.files.filter(
    (file) => file.type === 'File' && file.path.startsWith('word/media/'),
  );
  expect(mediaFiles).toHaveLength(printedQuestionNumbers.length);
  const documentFile = archive.files.find((file) => file.path === 'word/document.xml');
  expect(documentFile).toBeDefined();
  const documentXml = (await documentFile!.buffer()).toString();
  expect(documentXml.match(/<w:drawing>/g)).toHaveLength(printedQuestionNumbers.length);
  // The cover is page 1; every later printed page starts with a page break.
  expect(documentXml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(pageCount - 1);
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
