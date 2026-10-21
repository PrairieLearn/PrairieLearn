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
  test.slow();

  await page.getByRole('textbox', { name: 'String value' }).fill('café\u200b<img src=x>');
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByRole('textbox', { name: 'Matrix value' })).toHaveValue('[1,\u200b 2]');

  for (const label of [
    'String value',
    'Big O value',
    'Integer value',
    'Number value',
    'Units value',
    'Matrix value',
  ]) {
    await expect(
      page.getByRole('button', { name: `Answer as entered for ${label}` }),
    ).toBeVisible();
  }

  const stringButton = page.getByRole('button', { name: 'Answer as entered for String value' });
  await stringButton.click();
  const popover = page.getByRole('dialog').filter({ hasText: 'café<U+200b>' });
  await expect(popover).toHaveClass(/popover-wide/);
  await expect(popover).toHaveClass(/popover-scrollable/);
  await expect(popover).toContainText('café<U+200b><img src=x>');
  await expect(popover.getByRole('img')).toHaveCount(0);
  await expect(popover).toContainText('caf<U+e9><U+200b><img src=x>');
  await popover.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('textbox', { name: 'Big O value' }).fill('n');
  await page.getByRole('textbox', { name: 'Integer value' }).fill('1');
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submitted answer 2', exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const bigOButton = page.getByRole('button', { name: 'Answer as entered for Big O value' });
  await expect(bigOButton).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Answer as entered for Integer value' }),
  ).toHaveCount(0);
});

test('shows text and formula editor diagnostics for symbolic input', async ({ page }) => {
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible({
    timeout: 15_000,
  });

  const textButton = page.getByRole('button', { name: 'Original input for Symbolic value' });
  await expect(textButton).toBeVisible();
  await textButton.click();
  const textPopover = page.getByRole('dialog').filter({ hasText: 'x<U+200b>' });
  await expect(textPopover).toBeVisible();
  await textPopover.getByRole('button', { name: 'Close' }).click();

  const formulaButton = page.getByRole('button', {
    name: 'Original input for Symbolic formula value',
  });
  await expect(formulaButton).toBeVisible();
  await formulaButton.click();

  const formulaPopover = page.getByRole('dialog').filter({ hasText: 'Formula editor input:' });
  await expect(formulaPopover).toBeVisible();
  await expect(formulaPopover.locator('math-field')).toHaveCount(1);
  await expect(formulaPopover).toContainText('x');
});
