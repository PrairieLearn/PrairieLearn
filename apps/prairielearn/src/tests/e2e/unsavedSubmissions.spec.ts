import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import {
  hasUnsavedSubmission,
  selectOptionalUnsavedSubmission,
  upsertUnsavedSubmission,
} from '../../models/unsaved-submission.js';
import { parseInstanceQuestionId } from '../helperClient.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ features: { 'unsaved-submissions-collection': true } });
const recoveryTest = createTest({
  features: { 'unsaved-submissions-collection': true, 'unsaved-submissions-ui': true },
});

async function openQuestion(page: Page, courseInstance: CourseInstance) {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw1-automaticTestSuite',
  });
  const overviewUrl = `/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}/`;
  await page.goto(overviewUrl);
  await page.locator('a[href*="/instance_question/"]').first().click();
  await expect(page.locator('input[name="c"]')).toBeVisible();
  await expect(page.locator('form.question-form')).toHaveAttribute('data-original-form-data', /c=/);
  return overviewUrl;
}

async function captureWork(page: Page) {
  await page.locator('input[name="c"]').fill('unfinished');
  const response = page.waitForResponse((res) =>
    res.url().includes('/trpc/unsavedSubmissions.upsert'),
  );
  await page.clock.fastForward(30_000);
  const captured = await response;
  expect(captured.status()).toBe(200);
  return captured.request().postDataJSON().json as {
    uuid: string;
    formData: Record<string, string | string[]>;
  };
}

async function openRecoverableDraft(page: Page, courseInstance: CourseInstance) {
  await openQuestion(page, courseInstance);
  const user = await getConfiguredUser();
  const draftKey = {
    instance_question_id: String(parseInstanceQuestionId(page.url())),
    user_id: user.id,
    variant_id: await page.locator('form.question-form input[name="__variant_id"]').inputValue(),
  };
  await upsertUnsavedSubmission({
    ...draftKey,
    credit: 100,
    raw_submitted_answer: { c: '17' },
    uuid: randomUUID(),
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'You have unsaved work' })).toBeVisible();
  return () => selectOptionalUnsavedSubmission(draftKey);
}

test('captures dirty work and discards it only after navigation is accepted', async ({
  page,
  courseInstance,
}) => {
  await page.clock.install();
  const overviewUrl = await openQuestion(page, courseInstance);
  const questionUrl = page.url();
  const discards: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/unsaved_submission/discard')) {
      discards.push(request.url());
    }
  });
  const captured = await captureWork(page);
  expect(captured.formData.c).toBe('unfinished');
  const user = await getConfiguredUser();
  const draftExists = () =>
    hasUnsavedSubmission({
      instance_question_id: String(parseInstanceQuestionId(questionUrl)),
      user_id: user.id,
      variant_id: captured.formData.__variant_id as string,
    });
  expect(await draftExists()).toBe(true);

  page.once('dialog', (dialog) => dialog.dismiss());
  await expect(page.goto(overviewUrl)).rejects.toThrow('ERR_ABORTED');
  await expect(page).toHaveURL(questionUrl);
  expect(discards).toEqual([]);
  expect(await draftExists()).toBe(true);

  page.once('dialog', (dialog) => dialog.accept());
  await page.goto(overviewUrl);
  await expect.poll(draftExists).toBe(false);
});

test('retains captured work when a real submission fails', async ({ page, courseInstance }) => {
  await page.clock.install();
  await openQuestion(page, courseInstance);
  const questionUrl = page.url();
  const captured = await captureWork(page);
  const discards: string[] = [];
  page.context().on('request', (request) => {
    if (request.url().endsWith('/unsaved_submission/discard')) {
      discards.push(request.url());
    }
  });
  await page.route(page.url(), async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 403,
        contentType: 'text/html',
        body: '<h1>Submission was not accepted</h1>',
      });
    } else {
      await route.continue();
    }
  });

  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submission was not accepted' })).toBeVisible();
  expect(discards).toEqual([]);
  const user = await getConfiguredUser();
  expect(
    await hasUnsavedSubmission({
      instance_question_id: String(parseInstanceQuestionId(questionUrl)),
      user_id: user.id,
      variant_id: captured.formData.__variant_id as string,
    }),
  ).toBe(true);
});

recoveryTest(
  'preserves a recoverable draft while editing and restores its saved answers',
  async ({ page, courseInstance }) => {
    await page.clock.install();
    const selectDraft = await openRecoverableDraft(page, courseInstance);
    await page.locator('input[name="c"]').fill('29');
    await page.clock.fastForward(30_000);
    expect((await selectDraft())!.raw_submitted_answer).toEqual({ c: '17' });

    await page.getByRole('button', { name: 'Restore answers' }).click();
    await expect(page.getByRole('heading', { name: 'You have unsaved work' })).toHaveCount(0);
    await expect(page.locator('input[name="c"]')).toHaveValue('17');
    expect(await selectDraft()).toBeNull();
  },
);

recoveryTest(
  'dismisses the recovery banner and resumes collection of current answers',
  async ({ page, courseInstance }) => {
    await page.clock.install();
    const selectDraft = await openRecoverableDraft(page, courseInstance);
    await page.locator('input[name="c"]').fill('19');
    await page.getByRole('button', { name: 'Dismiss unsaved work' }).click();
    await expect(page.getByRole('heading', { name: 'You have unsaved work' })).toHaveCount(0);

    await page.clock.fastForward(30_000);
    await expect.poll(async () => (await selectDraft())?.raw_submitted_answer).toEqual({ c: '19' });
  },
);

recoveryTest(
  'replaces a recoverable draft only after the form stays dirty for two minutes',
  async ({ page, courseInstance }) => {
    await page.clock.install();
    const selectDraft = await openRecoverableDraft(page, courseInstance);
    const heading = page.getByRole('heading', { name: 'You have unsaved work' });
    await page.clock.fastForward(120_000);
    await expect(heading).toBeVisible();
    expect((await selectDraft())!.raw_submitted_answer).toEqual({ c: '17' });

    await page.locator('input[name="c"]').fill('29');
    await page.clock.fastForward(119_000);
    await expect(heading).toBeVisible();
    expect((await selectDraft())!.raw_submitted_answer).toEqual({ c: '17' });

    await page.clock.fastForward(1_001);
    await expect(heading).toHaveCount(0);
    await expect.poll(async () => (await selectDraft())?.raw_submitted_answer).toEqual({ c: '29' });
  },
);
