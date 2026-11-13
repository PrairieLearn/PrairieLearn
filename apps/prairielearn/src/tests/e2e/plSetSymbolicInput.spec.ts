import type { Page } from '@playwright/test';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

async function openSetInputQuestion(page: Page, courseInstance: CourseInstance): Promise<void> {
  const question = await selectQuestionByQid({
    qid: 'setSymbolicInput',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
}

test('loads shared assets when the page contains only pl-set-symbolic-input', async ({
  page,
  courseInstance,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await openSetInputQuestion(page, courseInstance);

  const formulaEditor = page.locator(
    '.pl-symbolic-input:has(input[name="domain-latex"]) math-field',
  );
  await expect(formulaEditor).toBeVisible();
  await expect(formulaEditor).toHaveAttribute('named-sets', 'named-sets');

  await formulaEditor.getByRole('button', { name: /Toggle Virtual Keyboard/ }).click();
  const realsKey = page.getByLabel('ℝ');
  await expect(realsKey).toBeVisible();
  await realsKey.click();
  await expect(page.locator('input[name="domain"]')).toHaveValue('R');

  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(
    page.getByTestId('submission-status').getByText('100%', { exact: true }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
