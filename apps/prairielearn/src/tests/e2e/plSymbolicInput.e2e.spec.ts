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

test.describe('pl-symbolic-input formula editor', () => {
  test.beforeEach(async ({ page, courseInstance }) => {
    await openSymbolicInputEditorQuestion(page, courseInstance);
  });

  test('uses configured accessible labels for formula editors', async ({ page }) => {
    const explicitlyLabelledEditor = page.locator('#symbolic-input-x');
    await expect(explicitlyLabelledEditor).toHaveAttribute(
      'aria-label',
      'Symbolic expression for x',
    );
    expect(await explicitlyLabelledEditor.getAttribute('aria-labelledby')).toBeNull();

    const visiblyLabelledEditor = page.locator('#symbolic-input-z');
    await expect(visiblyLabelledEditor).toHaveAttribute(
      'aria-labelledby',
      /^pl-symbolic-input-.+-label$/,
    );
    const labelId = await visiblyLabelledEditor.getAttribute('aria-labelledby');
    await expect(page.locator(`[id="${labelId}"]`)).toBeVisible();
  });

  test('submits formula editor values changed without an input event', async ({ page }) => {
    const formulaEditor = page.locator('#symbolic-input-x');
    await formulaEditor.evaluate((element) => {
      // Accessibility APIs can update MathLive without emitting an input event.
      (element as HTMLElement & { value: string }).value = 'y';
    });

    await expect(page.locator('#symbolic-input-sub-x')).toHaveValue('');
    await expect(page.locator('#symbolic-input-latex-x')).toHaveValue('');

    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.postData()?.includes('__action=grade') === true,
    );
    await page.getByRole('button', { name: /Save & Grade/ }).click();

    const request = await requestPromise;
    const body = request.postDataJSON() as Record<string, string>;
    expect(body.x).toBe('y');
    expect(body['x-latex']).toBe('y');
  });

  test('keeps the hidden LaTeX input empty for whitespace-only formula editor output', async ({
    page,
  }) => {
    const formulaEditor = page.locator('#symbolic-input-x');
    await formulaEditor.evaluate((element) => {
      const field = element as HTMLElement & { getValue(format: string): string };
      const originalGetValue = field.getValue.bind(field);
      field.getValue = (format: string) =>
        format === 'latex' ? '\n                \n            ' : '';
      field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      field.getValue = originalGetValue;
    });

    await expect(page.locator('#symbolic-input-latex-x')).toHaveValue('');
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

    const cases = [/sqrt/, /^\|\{#0\}\|$/, /operatorname\{sin\}/];

    for (const label of cases) {
      await expectPrefixInsertion(page, formulaEditor, 'x', async () => {
        await page.getByLabel(label).click();
      });
    }

    await expectPrefixInsertion(page, formulaEditor, 'x', async () => {
      await page.getByLabel(/operatorname\{sin\}/).dispatchEvent('pointerdown', {
        button: 0,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'mouse',
      });

      const variants = page.locator('.MLK__variant-panel.is-visible .item');
      await expect(variants).toHaveCount(4);
      await variants.first().dispatchEvent('pointerup', {
        button: 0,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'mouse',
      });
    });
  });

  test('keeps preceding content outside natural log when configured', async ({ page }) => {
    const formulaEditor = page.locator('#symbolic-input-lnx');
    await expect(formulaEditor).toBeVisible();
    await formulaEditor.getByRole('button', { name: /Toggle Virtual Keyboard/ }).click();

    await expectPrefixInsertion(page, formulaEditor, 'lnx', async () => {
      await page.getByLabel(/operatorname\{ln\}/).click();
    });
  });

  test('keeps multiplication outside bare logarithm arguments', async ({ page }) => {
    const formulaEditor = page.locator('#symbolic-input-lnx');
    const mathJson = page.locator('input[name="lnx-json"]');
    for (const { latex, expected } of [
      { latex: String.raw`\ln 4\cdot x`, expected: ['Multiply', ['Ln', 4], 'x'] },
      {
        latex: String.raw`\ln 8(x+1)`,
        expected: ['InvisibleOperator', ['Ln', 8], ['Delimiter', ['Add', 'x', 1]]],
      },
      {
        latex: String.raw`\ln 2x(x+1)`,
        expected: [
          'InvisibleOperator',
          ['Ln', ['InvisibleOperator', 2, 'x']],
          ['Delimiter', ['Add', 'x', 1]],
        ],
      },
      {
        latex: String.raw`\ln 8(x+1)^2`,
        expected: ['InvisibleOperator', ['Ln', 8], ['Power', ['Delimiter', ['Add', 'x', 1]], 2]],
      },
      {
        latex: String.raw`\ln 8(x+1)!`,
        expected: ['InvisibleOperator', ['Ln', 8], ['Factorial', ['Delimiter', ['Add', 'x', 1]]]],
      },
      { latex: String.raw`\operatorname{ln}4\cdot x`, expected: ['Multiply', ['Ln', 4], 'x'] },
      { latex: String.raw`\log 4\cdot x`, expected: ['Multiply', ['Log', 4], 'x'] },
      { latex: String.raw`\ln(4\cdot x)`, expected: ['Ln', ['Multiply', 4, 'x']] },
      { latex: String.raw`\ln{4\cdot x}`, expected: ['Ln', ['Multiply', 4, 'x']] },
      { latex: String.raw`\ln x^2`, expected: ['Ln', ['Power', 'x', 2]] },
      { latex: String.raw`\ln^2 x`, expected: ['Power', ['Ln', 'x'], 2] },
      { latex: String.raw`\log_2 x`, expected: ['Lb', 'x'] },
    ]) {
      await fillFormulaEditor(formulaEditor, latex);
      await expect(mathJson).toHaveValue(JSON.stringify(expected));
    }

    const customFunctionEditor = page.locator('#symbolic-input-custom_function');
    await fillFormulaEditor(customFunctionEditor, String.raw`\ln f(x)`);
    await expect(page.locator('input[name="custom_function-json"]')).toHaveValue(
      JSON.stringify(['Ln', ['f', 'x']]),
    );
  });
});

test.describe('pl-symbolic-input unicode multiplication keys', () => {
  test.beforeEach(async ({ page, courseInstance }) => {
    await openSymbolicInputEditorQuestion(page, courseInstance);
  });

  test('inserts unicode multiplication keys as \\cdot', async ({ page }) => {
    const formulaEditor = page.locator('#symbolic-input-x');
    await expect(formulaEditor).toBeVisible();

    // Bullet (e.g. Option+8 on macOS), bullet operator, and asterisk operator.
    // Playwright can't press non-ASCII keys, so dispatch the keydown directly.
    for (const key of ['•', '∙', '∗']) {
      await fillFormulaEditor(formulaEditor, '');
      await formulaEditor.press('2');
      await formulaEditor.evaluate((el, key) => {
        el.shadowRoot
          ?.querySelector('[part="keyboard-sink"]')
          ?.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }),
          );
      }, key);
      await page.keyboard.press('y');

      await expect(page.locator('#symbolic-input-latex-x')).toHaveValue(/^\{2\}\\cdot y$/);
      await expect(page.locator('#symbolic-input-sub-x')).toHaveValue('2 * y');
    }
  });
});

test('does not mark restored formula editor answers as unsaved', async ({
  page,
  courseInstance,
}) => {
  await page.addInitScript(() => {
    // Ensure the form captures its initial state before the element populates its hidden inputs.
    Object.defineProperty(window, 'PLSymbolicInput', {
      configurable: true,
      get: () => undefined,
      set(initialize: (name: string) => void) {
        Object.defineProperty(window, 'PLSymbolicInput', {
          configurable: true,
          writable: true,
          value: (name: string) => {
            const formulaEditor = document.getElementById(`symbolic-input-${name}`)!;
            const form = formulaEditor.closest<HTMLFormElement>('form.question-form')!;
            const initializeAfterBaselineCapture = () => {
              initialize(name);
              formulaEditor.dataset.testInitialized = 'true';
            };

            // The asynchronous handoff is essential to exercise deferred initialization,
            // but should not depend on how the unload tracker schedules baseline capture.
            if (form.dataset.originalFormData !== undefined) {
              initializeAfterBaselineCapture();
              return;
            }
            const observer = new MutationObserver(() => {
              observer.disconnect();
              initializeAfterBaselineCapture();
            });
            observer.observe(form, {
              attributes: true,
              attributeFilter: ['data-original-form-data'],
            });
          },
        });
      },
    });
  });
  await openSymbolicInputEditorQuestion(page, courseInstance);

  const formulaEditor = page.locator('#symbolic-input-x');
  await expect(formulaEditor).toBeVisible();
  await expect(
    formulaEditor,
    'deferred symbolic input test setup should finish initializing',
  ).toHaveAttribute('data-test-initialized', 'true');
  await fillFormulaEditor(formulaEditor, 'y');
  await page.getByRole('button', { name: /Save & Grade/ }).click();

  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible();
  await expect(page.locator('#symbolic-input-sub-x')).toHaveValue('y');
  await expect(page.locator('#symbolic-input-latex-x')).toHaveValue('y');

  const originalFormData = await page
    .locator('form.question-form')
    .getAttribute('data-original-form-data');
  const initialValues = new URLSearchParams(originalFormData ?? '');
  expect(Object.fromEntries(initialValues)).toMatchObject({
    x: 'y',
    'x-latex': 'y',
  });
});

test.describe('pl-symbolic-input plus-minus', () => {
  test.beforeEach(async ({ page, courseInstance }) => {
    await openSymbolicInputEditorQuestion(page, courseInstance);
  });

  test('rejects \\pm but accepts a typed "+-"', async ({ page }) => {
    const formulaEditor = page.locator('#symbolic-input-x');
    await expect(formulaEditor).toBeVisible();

    await formulaEditor.press('2');
    await page.keyboard.insertText('\u00b1');
    await page.keyboard.press('y');
    await expect(page.locator('#symbolic-input-latex-x')).toHaveValue('2\\pm y');
    await page.getByRole('button', { name: 'Save only' }).click();
    await expect(formulaEditor).toHaveClass(/is-invalid/);
    await expect(
      page.getByRole('button', { name: 'More info…', exact: true }).first(),
    ).toHaveAttribute('data-bs-content', /Parse error: Could not parse submitted answer\./);

    await fillFormulaEditor(formulaEditor, '');
    for (const key of '2+-y') await formulaEditor.press(key);
    await page.getByRole('button', { name: 'Save only' }).click();
    await expect(page.locator('#symbolic-input-latex-x')).toHaveValue('2+-y');
    await expect(formulaEditor).not.toHaveClass(/is-invalid/);
  });
});
