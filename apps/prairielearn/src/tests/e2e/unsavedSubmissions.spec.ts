import type { Page } from '@playwright/test';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { hasUnsavedSubmission } from '../../models/unsaved-submission.js';
import { parseInstanceQuestionId } from '../helperClient.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ features: { 'unsaved-submissions-collection': true } });

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
