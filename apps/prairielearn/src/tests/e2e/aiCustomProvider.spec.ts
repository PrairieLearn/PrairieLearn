import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  setAiGradingLastSelectedModel,
  setAiGradingMode,
} from '../../ee/lib/ai-grading/ai-grading-util.js';
import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import { makeAssessmentInstance } from '../../lib/assessment.js';
import { encryptForStorage } from '../../lib/encrypted-storage.js';
import {
  deleteCredential,
  replaceCustomCredential,
  selectCredentials,
  updateUseCustomApiKeys,
  upsertCredential,
} from '../../models/ai-grading-credentials.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { generateAndEnrollUsers } from '../../models/enrollment.js';
import { syncCourse } from '../helperCourse.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ isEnterprise: true, features: { 'ai-grading': true } });
const sql = loadSqlEquiv(import.meta.url);
const baseUrl = 'https://provider.example/v1';
const fakeKey = 'ui-test-key-not-a-real-secret';

async function respond(page: Page, operation: string, data: unknown) {
  await page.route(`**/aiGradingProviders.${operation}*`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ result: { data: { json: data } } }),
    }),
  );
}

async function resetCredentials(courseInstanceId: string) {
  const user = await getOrCreateUser({
    uid: 'dev@example.com',
    name: 'Dev User',
    uin: '000000000',
  });
  for (const credential of await selectCredentials(courseInstanceId)) {
    await deleteCredential({
      credential_id: credential.id,
      course_instance_id: courseInstanceId,
      authn_user_id: user.id,
    });
  }
  return user;
}

async function openSettings(page: Page, courseInstanceId: string) {
  await resetCredentials(courseInstanceId);
  await updateUseCustomApiKeys({
    course_instance_id: courseInstanceId,
    ai_grading_use_custom_api_keys: true,
  });
  await page.goto(`/pl/course_instance/${courseInstanceId}/instructor/instance_admin/ai_grading`);
  await expect(page.getByRole('checkbox', { name: 'Use custom API keys' })).toBeChecked();
  await page.getByRole('button', { name: 'Add key', exact: true }).click();
  await page.getByLabel('Provider', { exact: true }).selectOption('openai-compatible');
  await page.getByLabel('Base URL', { exact: true }).fill(baseUrl);
  await page.getByLabel('API key', { exact: true }).fill(fakeKey);
}

test('discovers, confirms, replaces and deletes custom configuration in the existing modal', async ({
  page,
  courseInstance,
}) => {
  const credential = {
    id: '42',
    provider: 'openai-compatible',
    base_url: baseUrl,
    created_at: '2026-10-13T00:00:00.000Z',
    dateAdded: '2026-10-13',
    apiKeyMasked: 'ui-...cret',
  };
  await respond(page, 'discover', { models: ['campus-text', 'campus-vision'] });
  await respond(page, 'save', { credential });
  await respond(page, 'destroy', null);
  await openSettings(page, courseInstance.id);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Provider models' })).toContainText('campus-text');
  await expect(page.getByText('campus-vision', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue(baseUrl);
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue(fakeKey);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const save = page.waitForRequest((request) => request.url().includes('aiGradingProviders.save'));
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  expect((await save).postDataJSON()).toEqual({
    json: { base_url: baseUrl, secret_key: fakeKey, expected_credential_id: null },
  });
  const table = page.getByRole('table', { name: 'API key credentials' });
  await expect(table).toContainText(baseUrl);
  await expect(table).not.toContainText(fakeKey);
  await page.getByRole('button', { name: 'Add key', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.getByLabel('Provider', { exact: true }).selectOption('openai-compatible');
  await expect(page.getByRole('alert')).toContainText('replace the existing configuration');
  await page.getByLabel('Base URL', { exact: true }).fill(baseUrl);
  await page.getByLabel('API key', { exact: true }).fill(fakeKey);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await respond(page, 'save', { credential: { ...credential, id: '43' } });
  const replace = page.waitForRequest((request) =>
    request.url().includes('aiGradingProviders.save'),
  );
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  expect((await replace).postDataJSON().json.expected_credential_id).toBe('42');
  await page.getByRole('button', { name: 'Delete OpenAI-compatible API key', exact: true }).click();
  const destroy = page.waitForRequest((request) =>
    request.url().includes('aiGradingProviders.destroy'),
  );
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  expect((await destroy).postDataJSON().json.credential_id).toBe('43');
  await expect(table).not.toContainText('OpenAI-compatible');
});

test('shows discovery errors and an empty model list without capability inputs', async ({
  page,
  courseInstance,
}) => {
  await page.route('**/aiGradingProviders.discover*', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          json: {
            message: 'Invalid provider API key',
            code: -32600,
            data: { code: 'BAD_REQUEST', httpStatus: 400 },
          },
        },
      }),
    }),
  );
  await openSettings(page, courseInstance.id);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid provider API key');
  await page.unroute('**/aiGradingProviders.discover*');
  await respond(page, 'discover', { models: [] });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No models were found');
  await expect(page.getByRole('button', { name: 'Save key', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0);
});

async function prepareGrading(courseInstanceId: string) {
  const user = await resetCredentials(courseInstanceId);
  await updateUseCustomApiKeys({
    course_instance_id: courseInstanceId,
    ai_grading_use_custom_api_keys: true,
  });
  const credential = await replaceCustomCredential({
    course_instance_id: courseInstanceId,
    expected_credential_id: null,
    base_url: baseUrl,
    encrypted_secret_key: encryptForStorage(fakeKey),
    created_by: user.id,
  });
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstanceId,
    tid: 'hw10-aiGrading',
  });
  const { assessment_question } = (
    await selectAssessmentQuestions({ assessment_id: assessment.id })
  )[0];
  await setAiGradingMode(assessment_question.id, true);
  const student = (
    await generateAndEnrollUsers({ count: 1, course_instance_id: courseInstanceId })
  )[0];
  const instance = await makeAssessmentInstance({
    assessment,
    user_id: student.id,
    authn_user_id: student.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const instanceQuestionId = await queryScalar(
    sql.mark_instance_question_for_manual_grading,
    { assessment_instance_id: instance, assessment_question_id: assessment_question.id },
    IdSchema,
  );
  return { assessment, assessment_question, credential, user, student, instanceQuestionId };
}

test('selects and restores a custom model with an official name, including custom-only accounts', async ({
  page,
  courseInstance,
}) => {
  const { assessment, assessment_question, credential } = await prepareGrading(courseInstance.id);
  await setAiGradingLastSelectedModel(assessment_question.id, 'gpt-6-sol', credential.id);
  await respond(page, 'models', { models: ['campus-text', 'gpt-6-sol'] });
  await page.route('**/manualGrading.aiGradeInstanceQuestions*', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          json: {
            message: 'Test request captured',
            code: -32600,
            data: { code: 'BAD_REQUEST', httpStatus: 400 },
          },
        },
      }),
    }),
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/manual_grading/assessment_question/${assessment_question.id}`,
  );
  await page.getByRole('button', { name: 'AI grading', exact: true }).click();
  await page.getByRole('button', { name: /^Grade all \d+$/ }).click();
  const section = page.getByRole('region', { name: 'Custom provider models' });
  await expect(section.getByRole('radio', { name: /^gpt-6-sol/ })).toBeChecked();
  await expect(section).toContainText('Price unknown');
  await expect(page.getByRole('button', { name: /Grade \d+ submission/ })).toBeEnabled();
  await page.getByLabel('Provider', { exact: true }).selectOption('openai-compatible');
  await page.getByLabel('Search models', { exact: true }).fill('campus');
  await expect(section.getByRole('radio')).toHaveCount(1);
  await section.getByRole('radio', { name: /^campus-text/ }).check();
  const grading = page.waitForRequest((request) =>
    request.url().includes('manualGrading.aiGradeInstanceQuestions'),
  );
  await page.getByRole('button', { name: /Grade \d+ submission/ }).click();
  expect((await grading).postDataJSON().json).toMatchObject({
    provider: 'openai-compatible',
    model_id: 'campus-text',
    credential_id: credential.id,
  });
  await expect(page.getByText('Test request captured', { exact: false })).toBeVisible();
});

test('a custom discovery failure does not block official models', async ({
  page,
  courseInstance,
}) => {
  const { assessment, assessment_question, user } = await prepareGrading(courseInstance.id);
  await upsertCredential({
    course_instance_id: courseInstance.id,
    provider: 'openai',
    encrypted_secret_key: encryptForStorage(fakeKey),
    created_by: user.id,
  });
  await page.route('**/aiGradingProviders.models*', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          json: {
            message: 'Custom endpoint unavailable',
            code: -32600,
            data: { code: 'BAD_REQUEST', httpStatus: 400 },
          },
        },
      }),
    }),
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/manual_grading/assessment_question/${assessment_question.id}`,
  );
  await page.getByRole('button', { name: 'AI grading', exact: true }).click();
  await page.getByRole('button', { name: /^Grade all \d+$/ }).click();
  await expect(page.getByRole('region', { name: 'Custom provider models' })).toContainText(
    'Custom endpoint unavailable',
  );
  await page.getByRole('radio', { name: /GPT 6 Sol/ }).check();
  await expect(page.getByRole('button', { name: /Grade \d+ submission/ })).toBeEnabled();
});

test('requires a new selection when the remembered provider has been replaced', async ({
  page,
  courseInstance,
}) => {
  const { assessment, assessment_question, credential } = await prepareGrading(courseInstance.id);
  await setAiGradingLastSelectedModel(assessment_question.id, 'gpt-6-sol', credential.id);
  await respond(page, 'list', {
    credential: { id: '999', provider: 'openai-compatible', base_url: baseUrl },
  });
  await respond(page, 'models', { models: ['gpt-6-sol'] });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/manual_grading/assessment_question/${assessment_question.id}`,
  );
  await page.getByRole('button', { name: 'AI grading', exact: true }).click();
  await page.getByRole('button', { name: /^Grade all \d+$/ }).click();
  await expect(
    page.getByText(
      'The previously selected custom model is no longer available. Select a model again.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Grade \d+ submission/ })).toBeDisabled();
  const model = page
    .getByRole('region', { name: 'Custom provider models' })
    .getByRole('radio', { name: /^gpt-6-sol/ });
  await expect(model).not.toBeChecked();
  await model.check();
  await expect(page.getByRole('button', { name: /Grade \d+ submission/ })).toBeEnabled();
});

test('passes custom identity from the single-submission grading modal', async ({
  page,
  baseURL,
  courseInstance,
  testCoursePath,
}) => {
  const assessmentPath = path.join(
    testCoursePath,
    'courseInstances/Sp15/assessments/hw10-aiGrading/infoAssessment.json',
  );
  const originalAssessment = await fs.readFile(assessmentPath, 'utf8');
  try {
    await fs.writeFile(
      assessmentPath,
      JSON.stringify({ ...JSON.parse(originalAssessment), allowAccess: [{ mode: 'Public' }] }),
    );
    await syncCourse(testCoursePath);
    const { assessment, credential, student, instanceQuestionId } = await prepareGrading(
      courseInstance.id,
    );
    await page.context().addCookies([
      { name: 'pl2_requested_uid', value: student.uid, url: baseURL },
      { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
    ]);
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instance_question/${instanceQuestionId}`,
    );
    await page
      .getByRole('textbox', { name: 'Explanation:' })
      .fill('The range and expression are incorrect.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.context().clearCookies();
    await respond(page, 'models', { models: ['campus-text'] });
    await page.route('**/manualGrading.aiGradeInstanceQuestions*', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            json: {
              message: 'Test request captured',
              code: -32600,
              data: { code: 'BAD_REQUEST', httpStatus: 400 },
            },
          },
        }),
      }),
    );
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${instanceQuestionId}`,
    );
    await page.getByRole('button', { name: 'AI grade', exact: true }).click();
    await page
      .getByRole('region', { name: 'Custom provider models' })
      .getByRole('radio', { name: /^campus-text/ })
      .check();
    const request = page.waitForRequest((r) =>
      r.url().includes('manualGrading.aiGradeInstanceQuestions'),
    );
    await page.getByRole('button', { name: 'Grade 1 submission', exact: true }).click();
    expect((await request).postDataJSON().json).toMatchObject({
      selection: [instanceQuestionId],
      provider: 'openai-compatible',
      model_id: 'campus-text',
      credential_id: credential.id,
    });
  } finally {
    await fs.writeFile(assessmentPath, originalAssessment);
    await syncCourse(testCoursePath);
  }
});
