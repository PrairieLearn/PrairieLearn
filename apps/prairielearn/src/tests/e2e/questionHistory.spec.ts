import type { Route } from '@playwright/test';

import { withResolvers } from '@prairielearn/utils';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

test('history preserves collapse choices during loading and reuses the rendered submission', async ({
  page,
  courseInstance,
  enableFeatureFlag,
}) => {
  await enableFeatureFlag('question-hosting-update');
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Save only', exact: true }).click();
  }
  const older = page.getByRole('button', { name: 'Show/hide older submissions' });
  await older.click();
  const oldest = page.getByTestId('submission-block').filter({
    has: page.getByRole('heading', { name: 'Submitted answer 1', exact: true }),
  });
  const toggle = oldest.getByRole('button', { name: 'Toggle submission details' });
  const pending = withResolvers<Route>();
  let requests = 0;
  await page.route('**/variant/*/submission/*', (route) => {
    requests++;
    pending.resolve(route);
  });
  await toggle.click();
  const route = await pending.promise;
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // Wait for the opening transition before collapsing the still-loading panel.
  await expect(oldest.getByText('Loading...', { exact: true })).toBeVisible();
  await expect(oldest.locator('.collapsing')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(oldest.locator('.collapsing')).toHaveCount(0);
  await older.click();

  await route.continue();
  await expect(oldest.getByText('Loading...', { exact: true })).toHaveCount(0);
  await expect(older).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.collapsing')).toHaveCount(0);
  await older.click();
  await expect(older).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(oldest.locator('.js-submission-body')).toBeVisible();
  expect(requests).toBe(1);
});
