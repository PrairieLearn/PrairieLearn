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
  await page.getByRole('textbox', { name: 'Big O value' }).fill('n');
  await page.getByRole('textbox', { name: 'Integer value' }).fill('1');
  await page.getByRole('textbox', { name: 'Number value', exact: true }).fill('1');
  await page.getByRole('textbox', { name: 'Units value' }).fill('1 meter');
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByRole('textbox', { name: 'Matrix value', exact: true })).toHaveValue(
    '[1,\u200b 2]',
  );

  for (const label of ['String value', 'Big O value', 'Units value', 'Valid matrix value']) {
    await expect(
      page.getByRole('button', { name: `Answer as entered for ${label}` }),
    ).toBeVisible();
  }
  for (const label of ['Integer value', 'Number value', 'Invalid number value', 'Matrix value']) {
    await expect(page.getByRole('button', { name: `Answer as entered for ${label}` })).toHaveCount(
      0,
    );
  }
  await expect(page.getByText('1<U+200b>', { exact: true })).toBeVisible();

  const stringButton = page.getByRole('button', { name: 'Answer as entered for String value' });
  await stringButton.click();
  const popover = page.getByRole('dialog').filter({ hasText: 'café<U+200b>' });
  await expect(popover).toHaveClass(/popover-wide/);
  await expect(popover).toHaveClass(/popover-scrollable/);
  await expect(popover).toContainText('café<U+200b><img src=x>');
  await expect(popover.getByRole('img')).toHaveCount(0);
  await expect(popover).toContainText('caf<U+e9><U+200b><img src=x>');
});

test('shows text and formula editor diagnostics for symbolic input', async ({ page }) => {
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible({
    timeout: 15_000,
  });

  const textButton = page.getByRole('button', { name: 'Original input for Symbolic value' });
  await expect(textButton).toBeVisible();
  await textButton.click();
  await expect(page.getByRole('tooltip').filter({ hasText: 'x<U+200b>' })).toBeVisible();
  await textButton.click();

  const formulaButton = page.getByRole('button', {
    name: 'Original input for Symbolic formula value',
  });
  await expect(formulaButton).toBeVisible();
  await formulaButton.click();

  const formulaPopover = page.getByRole('tooltip').filter({ hasText: 'Formula editor input:' });
  await expect(formulaPopover).toBeVisible();
  await expect(formulaPopover.locator('math-field')).toHaveCount(1);
  await expect(formulaPopover).toContainText('x');
});
