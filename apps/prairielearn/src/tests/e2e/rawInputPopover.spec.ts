import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

test('shows safe raw input diagnostics for scalar inputs', async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'rawInputRendering',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  await page.getByRole('textbox', { name: 'String value' }).fill('café\u200b<img src=x>');
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible({
    timeout: 15_000,
  });

  const button = page.getByRole('button', { name: 'Original input for String value' });
  await button.click();
  const popover = page.getByRole('tooltip').filter({ hasText: 'café<U+200b>' });
  await expect(popover).toHaveClass(/popover-wide/);
  await expect(popover).toHaveClass(/popover-scrollable/);
  await expect(popover).toContainText('café<U+200b><img src=x>');
  await expect(popover.locator('img')).toHaveCount(0);
  await popover.getByText('Show all non-ASCII characters').click();
  await expect(popover).toContainText('caf<U+e9><U+200b><img src=x>');
});
