import { randomUUID } from 'node:crypto';

import type { Page, Response } from '@playwright/test';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import {
  hasUnsavedSubmission,
  selectOptionalUnsavedSubmission,
  selectUnsavedSubmissionGeneration,
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
    generation: await selectUnsavedSubmissionGeneration(draftKey),
    credit: 100,
    raw_submitted_answer: { c: '17' },
    uuid: randomUUID(),
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'You have unsaved work' })).toBeVisible();
  return () => selectOptionalUnsavedSubmission(draftKey);
}

test('retries failed captures after a prevented save and uploads only changed snapshots', async ({
  page,
  courseInstance,
}) => {
  await page.clock.install();
  await openQuestion(page, courseInstance);
  const uploads: string[] = [];
  let releaseRetry!: () => void;
  let retryArrived!: () => void;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const retryStarted = new Promise<void>((resolve) => {
    retryArrived = resolve;
  });
  await page.route('**/trpc/unsavedSubmissions.upsert', async (route) => {
    uploads.push(route.request().postDataJSON().json.formData.c);
    if (uploads.length === 1) {
      await route.fulfill({ status: 503, body: 'Capture temporarily unavailable' });
      return;
    }
    if (uploads.length === 2) {
      retryArrived();
      await retryGate;
    }
    await route.continue();
  });

  const isCapture = (response: Response) =>
    response.url().includes('/trpc/unsavedSubmissions.upsert');
  await page.locator('input[name="c"]').fill('first');
  await page.locator('form.question-form').evaluate((form) => {
    form.addEventListener('submit', (event) => event.preventDefault(), { once: true });
  });
  await page.getByRole('button', { name: 'Save only', exact: true }).click();
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  const failed = page.waitForResponse(isCapture);
  await page.clock.runFor(30_000);
  expect((await failed).status()).toBe(503);
  await (await failed).finished();

  await page.clock.fastForward(30_000);
  await retryStarted;
  await page.locator('input[name="c"]').fill('second');
  const retried = page.waitForResponse(isCapture);
  releaseRetry();
  expect((await retried).status()).toBe(200);
  await (await retried).finished();

  const changed = page.waitForResponse(isCapture);
  await page.clock.fastForward(30_000);
  expect((await changed).status()).toBe(200);
  await (await changed).finished();

  await page.clock.runFor(90_000);
  await page.locator('input[name="c"]').fill('third');
  const changedAgain = page.waitForResponse(isCapture);
  await page.clock.fastForward(30_000);
  expect((await changedAgain).status()).toBe(200);
  expect(uploads).toEqual(['first', 'first', 'second', 'third']);
});

test('leaves an obsolete capture cleared and captures later edits from the same tab', async ({
  page,
  courseInstance,
}) => {
  await page.clock.install();
  await openQuestion(page, courseInstance);
  let uploads = 0;
  let generationQueries = 0;
  let releaseCapture!: () => void;
  let captureArrived!: () => void;
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  const captureStarted = new Promise<void>((resolve) => {
    captureArrived = resolve;
  });
  page.on('request', (request) => {
    if (request.url().includes('/trpc/unsavedSubmissions.generation')) generationQueries++;
  });
  await page.route('**/trpc/unsavedSubmissions.upsert', async (route) => {
    uploads++;
    if (uploads === 1) {
      captureArrived();
      await captureGate;
    }
    await route.continue();
  });
  await page.locator('input[name="c"]').fill('unfinished');
  await page.clock.fastForward(30_000);
  await captureStarted;

  const otherTab = await page.context().newPage();
  await otherTab.goto(page.url());
  await otherTab.locator('input[name="c"]').fill('17');
  await otherTab.getByRole('button', { name: 'Save only', exact: true }).click();
  await expect(otherTab.getByRole('heading', { name: 'Submitted answer' })).toBeVisible();
  await otherTab.close();

  const isCapture = (response: Response) =>
    response.url().includes('/trpc/unsavedSubmissions.upsert');
  const obsolete = page.waitForResponse(isCapture);
  releaseCapture();
  const obsoleteResponse = await obsolete;
  expect(obsoleteResponse.status()).toBe(200);
  expect((await obsoleteResponse.json()).result.data.json).toEqual({ saved: false });

  await page.clock.runFor(90_000);
  expect(uploads).toBe(1);
  expect(generationQueries).toBe(1);

  await page.locator('input[name="c"]').fill('19');
  const changed = page.waitForResponse(isCapture);
  await page.clock.fastForward(30_000);
  const changedResponse = await changed;
  expect(changedResponse.status()).toBe(200);
  expect((await changedResponse.json()).result.data.json).toEqual({ saved: true });
  expect(uploads).toBe(2);
  expect(generationQueries).toBe(2);
});

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
  'replaces a recoverable draft only after two dirty minutes, restarting after a prevented save',
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

    await page.locator('form.question-form').evaluate((form) => {
      form.addEventListener('submit', (event) => event.preventDefault(), { once: true });
    });
    await page.getByRole('button', { name: 'Save only', exact: true }).click();
    await page.locator('input[name="c"]').fill('31');
    await page.clock.fastForward(1_001);
    await expect(heading).toBeVisible();
    expect((await selectDraft())!.raw_submitted_answer).toEqual({ c: '17' });

    await page.clock.fastForward(118_000);
    await expect(heading).toBeVisible();
    expect((await selectDraft())!.raw_submitted_answer).toEqual({ c: '17' });

    await page.clock.fastForward(1_001);
    await expect(heading).toHaveCount(0);
    await expect.poll(async () => (await selectDraft())?.raw_submitted_answer).toEqual({ c: '31' });
  },
);
