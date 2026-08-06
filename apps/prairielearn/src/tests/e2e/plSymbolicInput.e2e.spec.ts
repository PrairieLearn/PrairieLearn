import type { Locator, Page } from '@playwright/test';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

async function openSymbolicInputEditorQuestion(
  page: Page,
  courseInstance: CourseInstance,
): Promise<void> {
  const question = await selectQuestionByQid({
    qid: 'symbolicInputEditor',
    course_id: courseInstance.course_id,
  });

  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
}

async function fillFormulaEditor(formulaEditor: Locator, latex: string): Promise<void> {
  await formulaEditor.evaluate((el, latex) => {
    (el as HTMLElement & { value: string }).value = latex;
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }, latex);
}

async function expectPrefixInsertion(
  page: Page,
  formulaEditor: Locator,
  answersName: string,
  insert: () => Promise<void>,
): Promise<void> {
  await fillFormulaEditor(formulaEditor, '');
  await formulaEditor.press('3');
  await insert();
  await page.keyboard.press('y');

  await expect(page.locator(`#symbolic-input-latex-${answersName}`)).toHaveValue(/^3.*y.+$/);
}

test.describe('pl-symbolic-input prefix insertion', () => {
  test.beforeEach(async ({ page, courseInstance }) => {
    await openSymbolicInputEditorQuestion(page, courseInstance);
  });

  test('keeps preceding content outside typed square roots and absolute values', async ({
    page,
  }) => {
    const formulaEditor = page.locator('#symbolic-input-x');
    await expect(formulaEditor).toBeVisible();

    await fillFormulaEditor(formulaEditor, '');
    for (const key of '3sqrty') await formulaEditor.press(key);
    await expect(page.locator('#symbolic-input-latex-x')).toHaveValue(/^3\\sqrt/);

    await fillFormulaEditor(formulaEditor, '');
    for (const key of '3|y') await formulaEditor.press(key);
    await expect(page.locator('#symbolic-input-latex-x')).toHaveValue(/^3.*y.+$/);
  });

  test('keeps preceding content outside square roots inserted from the context menu', async ({
    page,
  }) => {
    const formulaEditor = page.locator('#symbolic-input-x');
    await expect(formulaEditor).toBeVisible();
    await formulaEditor.press('3');
    await formulaEditor.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /√/ }).click();

    await expect(page.locator('#symbolic-input-latex-x')).toHaveValue(/^3\\sqrt/);
  });

  test('keeps preceding content outside virtual keyboard prefix functions', async ({ page }) => {
    const formulaEditor = page.locator('#symbolic-input-x');
    await expect(formulaEditor).toBeVisible();
    await formulaEditor.getByRole('button', { name: /Toggle Virtual Keyboard/ }).click();

    const cases = [
      /sqrt/,
      /operatorname\{log\}/,
      /^\|\{#0\}\|$/,
      /operatorname\{min\}/,
      /operatorname\{max\}/,
      /operatorname\{sign\}/,
      /operatorname\{sin\}/,
      /operatorname\{cos\}/,
      /operatorname\{tan\}/,
    ];

    for (const label of cases) {
      await expectPrefixInsertion(page, formulaEditor, 'x', async () => {
        await page.getByLabel(label).click();
      });
    }

    const variantCases = [
      { label: /operatorname\{sin\}/, count: 4 },
      { label: /operatorname\{cos\}/, count: 4 },
      { label: /operatorname\{tan\}/, count: 5 },
    ];

    for (const { label, count } of variantCases) {
      for (let index = 0; index < count; index++) {
        await expectPrefixInsertion(page, formulaEditor, 'x', async () => {
          await page.getByLabel(label).dispatchEvent('pointerdown', {
            button: 0,
            isPrimary: true,
            pointerId: 1,
            pointerType: 'mouse',
          });

          const variants = page.locator('.MLK__variant-panel.is-visible .item');
          await expect(variants).toHaveCount(count);
          await variants.nth(index).dispatchEvent('pointerup', {
            button: 0,
            isPrimary: true,
            pointerId: 1,
            pointerType: 'mouse',
          });
        });
      }
    }
  });

  test('keeps preceding content outside natural log when configured', async ({ page }) => {
    const formulaEditor = page.locator('#symbolic-input-lnx');
    await expect(formulaEditor).toBeVisible();
    await formulaEditor.getByRole('button', { name: /Toggle Virtual Keyboard/ }).click();

    await expectPrefixInsertion(page, formulaEditor, 'lnx', async () => {
      await page.getByLabel(/operatorname\{ln\}/).click();
    });
  });
});
