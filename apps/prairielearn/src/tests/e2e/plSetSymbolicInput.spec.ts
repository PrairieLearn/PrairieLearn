import type { Locator, Page } from '@playwright/test';

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

async function fillFormulaEditor(formulaEditor: Locator, latex: string): Promise<void> {
  await formulaEditor.evaluate((element, value) => {
    (element as HTMLElement & { value: string }).value = value;
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }, latex);
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
  await expect(formulaEditor).toHaveAttribute('set-syntax', 'tuple');

  await formulaEditor.getByRole('button', { name: /Toggle Virtual Keyboard/ }).click();
  const realsKey = page.getByLabel('ℝ');
  await expect(realsKey).toBeVisible();
  await realsKey.click();
  await expect(page.locator('input[name="domain"]')).toHaveValue('RR');

  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(
    page.getByTestId('submission-status').getByText('100%', { exact: true }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('submits and grades formula-editor set-builder notation', async ({ page, courseInstance }) => {
  await openSetInputQuestion(page, courseInstance);

  const formulaEditor = page.locator(
    '.pl-symbolic-input:has(input[name="domain-latex"]) math-field',
  );
  await expect(formulaEditor).toBeVisible();
  await formulaEditor.getByRole('button', { name: /Toggle Virtual Keyboard/ }).click();
  await expect(page.getByText('∈', { exact: true })).toBeVisible();

  await fillFormulaEditor(formulaEditor, String.raw`\{x\mid x=x\}`);
  const rawMathJson = await page.locator('input[name="domain-json"]').inputValue();
  expect(JSON.parse(rawMathJson)).toEqual(['Set', 'x', ['Condition', ['Equal', 'x', 'x']]]);

  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(
    page.getByTestId('submission-status').getByText('100%', { exact: true }),
  ).toBeVisible();
});
