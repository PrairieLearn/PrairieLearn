import type { Page, Request } from '@playwright/test';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

async function openPreview(page: Page, courseInstance: { id: string; course_id: string }) {
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
  return (await page.locator('.question-container').getAttribute('data-variant-id'))!;
}

const isNavigationPost = (request: Request) =>
  request.method() === 'POST' && request.isNavigationRequest();

test('the application submits answers with its own credentials', async ({
  page,
  courseInstance,
  enableFeatureFlag,
}) => {
  await enableFeatureFlag('question-hosting-update');
  const variantId = await openPreview(page, courseInstance);
  await expect(
    page.locator('.question-container').locator('[name="__csrf_token"], [name="__variant_id"]'),
  ).toHaveCount(0);

  const answer = page.locator('input[name="c"]');
  await answer.fill('3');
  const graded = page.waitForRequest(isNavigationPost);
  await page.getByRole('button', { name: 'Save & Grade' }).click();
  const fields = new URLSearchParams((await graded).postData() ?? '');
  expect(fields.get('__csrf_token')).toBeTruthy();
  expect(fields.get('__variant_id')).toBe(variantId);
  expect(fields.get('__action')).toBe('grade');
  expect(fields.get('c')).toBe('3');
  await expect(page.getByTestId('submission-block')).toHaveCount(1);
  await expect(page.locator('.question-container')).toHaveAttribute('data-variant-id', variantId);

  // Implicit submission uses the form's first submit button, which saves.
  const saved = page.waitForRequest(isNavigationPost);
  await answer.fill('4');
  await answer.press('Enter');
  expect(new URLSearchParams((await saved).postData() ?? '').get('__action')).toBe('save');
  await expect(page.getByTestId('submission-block')).toHaveCount(2);
});

test('the application warns about unsaved answers before navigating to a new variant', async ({
  page,
  courseInstance,
  enableFeatureFlag,
}) => {
  await enableFeatureFlag('question-hosting-update');
  const variantId = await openPreview(page, courseInstance);
  const answer = page.locator('input[name="c"]');
  await answer.click();
  await answer.fill('3');

  // Dismiss prompts as they open: the click can wait for the navigation it triggers,
  // and that navigation waits for the prompt.
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'New variant' }).click();
  await expect.poll(() => dialogs).toEqual(['beforeunload']);
  await expect(page.locator('.question-container')).toHaveAttribute('data-variant-id', variantId);

  // Saving does not prompt, and afterwards nothing is unsaved.
  await page.getByRole('button', { name: 'Save only' }).click();
  await expect(page.getByTestId('submission-block')).toHaveCount(1);
  await page.getByRole('link', { name: 'New variant' }).click();
  await expect(page.locator('.question-container')).not.toHaveAttribute(
    'data-variant-id',
    variantId,
  );
  expect(dialogs).toEqual(['beforeunload']);
});
