import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectAssessmentByTid } from '../../models/assessment.js';
import {
  deleteUnsavedSubmissions,
  selectOptionalUnsavedSubmission,
  selectUnsavedSubmissionGeneration,
  upsertUnsavedSubmission,
} from '../../models/unsaved-submission.js';
import { parseInstanceQuestionId } from '../helperClient.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({
  features: {
    'unsaved-submissions-ui': true,
    'unsaved-submissions-instructor-promotion': true,
  },
});
const sql = loadSqlEquiv(import.meta.url);

test('previews captured files in isolation and promotes an instructor-selected draft', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw9-internalExternalManual',
  });
  await page.goto(`/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}/`);
  await page.getByRole('link', { name: 'Manual Grading: Fibonacci function, file upload' }).click();
  await expect(
    page.getByRole('button', { name: /Drop files here or click to upload/ }),
  ).toBeVisible();
  const user = await getConfiguredUser();
  const draftKey = {
    instance_question_id: String(parseInstanceQuestionId(page.url())),
    user_id: user.id,
    variant_id: await page.locator('form.question-form input[name="__variant_id"]').inputValue(),
  };
  const fileInputName = (await page.locator('input[name^="_file_upload_"]').getAttribute('name'))!;
  const fileContents =
    '# <script>window.parent.document.body.textContent = "changed"</script>\ndef fib(n): return n\n';
  await upsertUnsavedSubmission({
    ...draftKey,
    generation: await selectUnsavedSubmissionGeneration(draftKey),
    credit: 75,
    raw_submitted_answer: {
      [fileInputName]: JSON.stringify([
        { name: 'fib.py', contents: Buffer.from(fileContents).toString('base64') },
      ]),
    },
    uuid: randomUUID(),
  });
  const assessmentInstanceId = await queryScalar(
    sql.select_assessment_instance_id,
    { instance_question_id: draftKey.instance_question_id },
    IdSchema,
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}`,
  );
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved work' });
  const iframe = page.getByTitle('Unsaved work preview');
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-downloads');
  const preview = iframe.contentFrame();
  await expect(preview.getByRole('heading', { name: 'Question', exact: true })).toBeVisible();
  const capturedAnswer = preview.getByRole('region', { name: 'Captured answer' });
  await capturedAnswer.getByRole('button', { name: 'Show preview', exact: true }).click();
  await expect(capturedAnswer.locator('pre code')).toHaveText(fileContents);
  const downloading = page.waitForEvent('download');
  await capturedAnswer.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('fib.py');
  expect(await readFile(await download.path(), 'utf8')).toBe(fileContents);
  await expect(
    preview
      .getByRole('region', { name: 'Question', exact: true })
      .getByRole('button', { name: 'Delete', exact: true }),
  ).toBeDisabled();
  expect(
    await preview.getByRole('main').evaluate(() => {
      try {
        void window.parent.document.body;
        return false;
      } catch (error) {
        return error instanceof DOMException && error.name === 'SecurityError';
      }
    }),
  ).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Save and grade', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save and grade', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveCount(0);
  expect(await selectOptionalUnsavedSubmission(draftKey)).toBeNull();
});

test('previews captured Calculation answers without allowing edits', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw1-automaticTestSuite',
  });
  await page.goto(`/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}/`);
  await page.getByRole('link', { name: 'Addition of vectors in Cartesian coordinates' }).click();
  await expect(page.locator('[data-instavalue="submittedAnswer.wx"]')).toBeVisible();
  const user = await getConfiguredUser();
  const variantId = await page
    .locator('.question-data')
    .evaluate((element) => JSON.parse(decodeURIComponent(atob(element.textContent))).variant.id);
  const draftKey = {
    instance_question_id: String(parseInstanceQuestionId(page.url())),
    user_id: user.id,
    variant_id: String(variantId),
  };
  await upsertUnsavedSubmission({
    ...draftKey,
    generation: await selectUnsavedSubmissionGeneration(draftKey),
    credit: 100,
    raw_submitted_answer: { wx: '17', wy: '23' },
    uuid: randomUUID(),
  });
  const assessmentInstanceId = await queryScalar(
    sql.select_assessment_instance_id,
    { instance_question_id: draftKey.instance_question_id },
    IdSchema,
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}`,
  );
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const preview = page.getByTitle('Unsaved work preview').contentFrame();
  const wx = preview.locator('[data-instavalue="submittedAnswer.wx"]');
  await expect(wx).toHaveValue('17');
  await expect(wx).toBeDisabled();
  await expect(preview.locator('[data-instavalue="submittedAnswer.wy"]')).toHaveValue('23');
  await expect(
    preview
      .getByRole('region', { name: 'Captured answer' })
      .getByRole('img', { name: /17 comma 23/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: 'Unsaved work' })
      .getByRole('button', { name: 'Save and grade', exact: true }),
  ).toBeEnabled();
  await deleteUnsavedSubmissions({
    instance_question_id: draftKey.instance_question_id,
    user_id: user.id,
  });
});

test('shows captured file editor contents in the isolated read-only preview', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw9-internalExternalManual',
  });
  await page.goto(`/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}/`);
  await page.getByRole('link', { name: 'External Grading: Alpine with flexible result' }).click();
  await expect(page.locator('.ace_editor')).toBeVisible();
  const user = await getConfiguredUser();
  const draftKey = {
    instance_question_id: String(parseInstanceQuestionId(page.url())),
    user_id: user.id,
    variant_id: await page.locator('form.question-form input[name="__variant_id"]').inputValue(),
  };
  const fileInputName = (await page.locator('input[name^="_file_editor_"]').getAttribute('name'))!;
  const fileContents = '{ "score": 0.75, "feedback": "captured editor draft" }';
  await upsertUnsavedSubmission({
    ...draftKey,
    generation: await selectUnsavedSubmissionGeneration(draftKey),
    credit: 100,
    raw_submitted_answer: {
      [fileInputName]: Buffer.from(fileContents).toString('base64'),
    },
    uuid: randomUUID(),
  });
  const assessmentInstanceId = await queryScalar(
    sql.select_assessment_instance_id,
    { instance_question_id: draftKey.instance_question_id },
    IdSchema,
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}`,
  );
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const iframe = page.getByTitle('Unsaved work preview');
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-downloads');
  const preview = iframe.contentFrame();
  await expect(preview.locator('.ace_editor')).toContainText('captured editor draft');
  await expect(preview.locator('.ace_text-input')).toHaveJSProperty('readOnly', true);
  await deleteUnsavedSubmissions({
    instance_question_id: draftKey.instance_question_id,
    user_id: user.id,
  });
});

test('lets staff view captured answers after resetting question variants', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw1-automaticTestSuite',
  });
  await page.goto(`/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}/`);
  await page.getByRole('link', { name: 'Add two numbers' }).click();
  const user = await getConfiguredUser();
  const draftKey = {
    instance_question_id: String(parseInstanceQuestionId(page.url())),
    user_id: user.id,
    variant_id: await page.locator('form.question-form input[name="__variant_id"]').inputValue(),
  };
  const capturedAnswer = { c: '17' };
  await upsertUnsavedSubmission({
    ...draftKey,
    generation: await selectUnsavedSubmissionGeneration(draftKey),
    credit: 100,
    raw_submitted_answer: capturedAnswer,
    uuid: randomUUID(),
  });
  const assessmentInstanceId = await queryScalar(
    sql.select_assessment_instance_id,
    { instance_question_id: draftKey.instance_question_id },
    IdSchema,
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}`,
  );
  const questionRow = page.getByRole('row').filter({ hasText: /I-\d+\.\s+addNumbers\s+\(/ });
  await questionRow.getByRole('button', { name: 'Action', exact: true }).click();
  await questionRow.getByRole('button', { name: 'Reset question variants', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Confirm reset question variants' })
    .getByRole('button', { name: 'Reset question variants', exact: true })
    .click();
  await questionRow.getByRole('button', { name: 'View', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved work' });
  await expect(dialog.getByRole('alert')).toContainText('cannot be saved or graded');
  await expect(dialog.getByRole('button', { name: 'Save and grade', exact: true })).toBeDisabled();
  const preview = page.getByTitle('Unsaved work preview').contentFrame();
  await expect(
    preview.getByRole('region', { name: 'Captured answer' }).locator('pre code'),
  ).toHaveText(JSON.stringify(capturedAnswer, null, 2));
  expect((await selectOptionalUnsavedSubmission(draftKey))!.raw_submitted_answer).toEqual(
    capturedAnswer,
  );
  await deleteUnsavedSubmissions({
    instance_question_id: draftKey.instance_question_id,
    user_id: user.id,
  });
});
