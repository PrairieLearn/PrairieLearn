import type { Route } from '@playwright/test';

import { withResolvers } from '@prairielearn/utils';

import { features } from '../../lib/features/index.js';
import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

for (const initiallyEnabled of [false, true]) {
  test(`submission dialogs retain the page's mode when the flag changes to ${!initiallyEnabled}`, async ({
    page,
    courseInstance,
    enableFeatureFlag,
  }) => {
    if (initiallyEnabled) await enableFeatureFlag('question-hosting-update');
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

    if (initiallyEnabled) {
      await features.disable('question-hosting-update');
    } else {
      await enableFeatureFlag('question-hosting-update');
    }
    await page.getByRole('button', { name: 'Show/hide older submissions' }).click();
    const oldestSubmission = page.getByTestId('submission-block').filter({
      has: page.getByRole('heading', { name: 'Submitted answer 1', exact: true }),
    });
    const responsePromise = page.waitForResponse('**/variant/*/submission/*');
    await oldestSubmission.getByRole('button', { name: 'Toggle submission details' }).click();
    const panels = await (await responsePromise).json();
    if (initiallyEnabled) {
      expect(panels).toHaveProperty('submissionInfo');
    } else {
      expect(panels).not.toHaveProperty('submissionInfo');
    }
    await expect(oldestSubmission.getByText('Loading...', { exact: true })).toHaveCount(0);
    const trigger = oldestSubmission.getByRole('button', { name: 'Submission info' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Submission info', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(trigger).toBeFocused();
  });
}

test('question menus work with and without application dialogs', async ({
  page,
  courseInstance,
  enableFeatureFlag,
}) => {
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: courseInstance.course_id,
  });
  const previewUrl = `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`;

  for (const enabled of [false, true]) {
    if (enabled) await enableFeatureFlag('question-hosting-update');
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'View…', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Manual grading view', exact: true }),
    ).toBeVisible();
  }
});

test('submission dialogs restore focus after a pending history render replaces the trigger', async ({
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
  await page.getByRole('button', { name: 'Show/hide older submissions' }).click();
  const oldestSubmission = page.getByTestId('submission-block').filter({
    has: page.getByRole('heading', { name: 'Submitted answer 1', exact: true }),
  });

  // Keep the original trigger present until the dialog has opened.
  const pendingRender = withResolvers<Route>();
  await page.route('**/variant/*/submission/*', (route) => pendingRender.resolve(route));
  await oldestSubmission.getByRole('button', { name: 'Toggle submission details' }).click();
  const route = await pendingRender.promise;
  const trigger = oldestSubmission.getByRole('button', { name: 'Submission info' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Submission info', exact: true });
  await expect(dialog).toBeVisible();

  await route.continue();
  await expect(oldestSubmission.getByText('Loading...', { exact: true })).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(trigger).toBeFocused();
});
