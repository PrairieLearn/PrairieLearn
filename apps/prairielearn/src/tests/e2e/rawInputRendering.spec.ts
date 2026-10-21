import type { Page } from '@playwright/test';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

async function openRawInputRenderingQuestion(page: Page, courseInstance: CourseInstance) {
  const question = await selectQuestionByQid({
    qid: 'rawInputRendering',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
}

test.beforeEach(async ({ page, courseInstance }) => {
  await openRawInputRenderingQuestion(page, courseInstance);
});

test('shows safe scalar diagnostics and restores literal matrix input', async ({ page }) => {
  await page.getByRole('textbox', { name: 'String value' }).fill('café\u200b<img src=x>');
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByRole('textbox', { name: 'Matrix value' })).toHaveValue('[1,\u200b 2]');

  const button = page.getByRole('button', { name: 'Original input for String value' });
  await button.click();
  const popover = page.getByRole('tooltip').filter({ hasText: 'café<U+200b>' });
  await expect(popover).toHaveClass(/popover-wide/);
  await expect(popover).toHaveClass(/popover-scrollable/);
  await expect(popover).toContainText('café<U+200b><img src=x>');
  await expect(popover.getByRole('img')).toHaveCount(0);
  await popover.getByText('Show all non-ASCII characters').click();
  await expect(popover).toContainText('caf<U+e9><U+200b><img src=x>');
});
