import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { TEST_COURSE_PATH } from '../../lib/paths.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseByShortName } from '../../models/course.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { selectQuestionByQid } from '../../models/question.js';
import { type AssessmentJsonInput, type CalculatorType } from '../../schemas/infoAssessment.js';
import { syncCourse } from '../helperCourse.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const assessmentTid = 'exam20-assessmentTools';

function infoAssessmentPath(testCoursePath: string): string {
  return path.join(
    testCoursePath,
    'courseInstances/Sp15/assessments',
    assessmentTid,
    'infoAssessment.json',
  );
}

async function resetAssessmentFromTemplate(testCoursePath: string): Promise<void> {
  const relativePath = path.join(
    'courseInstances',
    'Sp15',
    'assessments',
    assessmentTid,
    'infoAssessment.json',
  );
  await fs.copyFile(
    path.join(TEST_COURSE_PATH, relativePath),
    path.join(testCoursePath, relativePath),
  );
  await syncCourse(testCoursePath);
}

async function readInfoAssessment(testCoursePath: string) {
  const content = await fs.readFile(infoAssessmentPath(testCoursePath), 'utf-8');
  return JSON.parse(content);
}

async function enterEditMode(page: Page, ciId: string, aId: string): Promise<void> {
  await page.goto(`/pl/course_instance/${ciId}/instructor/assessment/${aId}/questions`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('[aria-label="Drag to reorder"]').first()).toBeVisible();
}

async function configureCalculator(
  testCoursePath: string,
  type: CalculatorType,
  zoneOverride = false,
) {
  const relativePath =
    'courseInstances/Sp15/assessments/hw1-automaticTestSuite/infoAssessment.json';
  const assessment: AssessmentJsonInput = JSON.parse(
    await fs.readFile(path.join(TEST_COURSE_PATH, relativePath), 'utf8'),
  );
  assessment.tools = {
    calculator: { enabled: true, type: zoneOverride ? 'advanced' : type },
  };
  assessment.zones = [
    {
      title: 'Calculator zone',
      questions: [{ id: 'addNumbers', points: 1, maxPoints: 5 }],
      ...(zoneOverride ? { tools: { calculator: { enabled: true, type } } } : {}),
    },
  ];
  await fs.writeFile(path.join(testCoursePath, relativePath), JSON.stringify(assessment));
  await syncCourse(testCoursePath);
}

async function expectLatex(field: Locator, latex: string) {
  await expect
    .poll(() => field.evaluate((element) => (element as HTMLElement & { value: string }).value))
    .toBe(latex);
}

async function checkPinyinComposition(page: Page) {
  const input = page.getByLabel('Calculator input', { exact: true });
  const prior = await input.evaluate(
    (element) => (element as HTMLElement & { value: string }).value,
  );
  const historyCount = await page.getByTestId('history-output').count();
  const ime = await page.context().newCDPSession(page);
  for (const text of ['ni', 'nihao', '你好']) {
    await ime.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    // MathLive repositions the hidden keyboard sink on the next frame. A later
    // composition update then asks the browser to scroll that sink into view.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  }
  await expect(page.getByRole('region', { name: 'Calculator', exact: true })).toHaveJSProperty(
    'scrollLeft',
    0,
  );
  await expect(page.getByRole('button', { name: '7', exact: true })).toBeInViewport();
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await expect(page.getByTestId('history-output')).toHaveCount(historyCount);
  await ime.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await expectLatex(input, prior);
  await ime.detach();
}

test.describe('Assessment tools', () => {
  test.beforeEach(async ({ testCoursePath }) => {
    await resetAssessmentFromTemplate(testCoursePath);
  });

  test('can configure calculator presets in assessment settings', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/settings`,
    );
    const calculatorCheckbox = page.getByRole('checkbox', { name: 'Calculator', exact: true });
    await expect(calculatorCheckbox).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Advanced', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Calculator', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Calculator', exact: true });
    const previewTabs = preview.getByRole('group', { name: 'Calculator keyboard subgroup panel' });
    await expect(previewTabs.getByRole('radio')).toHaveCount(3);
    await expect(previewTabs.getByRole('radio', { name: 'full', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Basic', exact: true }).check();
    await expect(preview).toHaveAttribute('data-calculator-mode', 'basic');
    await expect(previewTabs).not.toBeVisible();
    expect(
      await preview.evaluate((element) => ({
        transform: getComputedStyle(element).transform,
        animations: element.getAnimations().length,
      })),
    ).toEqual({ transform: 'none', animations: 0 });
    const input = preview.getByLabel('Calculator input', { exact: true });
    await input.click();
    await input.pressSequentially('12+34');
    await checkPinyinComposition(page);
    await input.press('Enter');
    await expectLatex(preview.getByTestId('history-output').locator('math-field').first(), '=46');
    await preview.getByRole('button', { name: 'Toggle calculator' }).click();
    await page.getByRole('radio', { name: 'Scientific', exact: true }).check();
    await expect(preview).not.toBeVisible();
    const floatingButton = page.getByRole('button', { name: 'Open calculator', exact: true });
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(async () => {
      const buttonBox = (await floatingButton.boundingBox())!;
      const saveBox = (await save.boundingBox())!;
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(saveBox.y);
    }).toPass();
    await save.click();
    await expect(page.getByText('Assessment updated successfully')).toBeVisible();
    expect((await readInfoAssessment(testCoursePath)).tools.calculator).toEqual({
      enabled: true,
      type: 'scientific',
    });
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Scientific', exact: true })).toBeChecked();
    await calculatorCheckbox.uncheck();
    await save.click();
    await expect(page.getByText('Assessment updated successfully')).toBeVisible();
    expect((await readInfoAssessment(testCoursePath)).tools.calculator.enabled).toBe(false);
    await calculatorCheckbox.check();
    await page.getByRole('radio', { name: 'Advanced', exact: true }).check();
    await save.click();
    await expect(page.getByText('Assessment updated successfully')).toBeVisible();
    const saved = (await readInfoAssessment(testCoursePath)).tools.calculator;
    expect(saved.enabled).toBe(true);
    expect(saved.type ?? 'advanced').toBe('advanced');
  });

  test('can override and disable calculator tool in a zone', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    // Template has calculator=true at assessment level and Zone 2 has no tool overrides,
    // so Zone 2 inherits calculator=true from the assessment.
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstance.id, assessment.id);

    await page
      .getByRole('button')
      .filter({ hasText: 'Zone without tool overrides' })
      .first()
      .click();

    // Calculator is inherited (enabled from assessment). Click Override to allow zone-level change.
    // Scope to the Calculator field's container to avoid matching other Override buttons.
    const calculatorField = page.locator('.form-check').filter({ hasText: 'Calculator' });
    await calculatorField.getByRole('button', { name: 'Override' }).click();

    await page.getByRole('radio', { name: 'Scientific', exact: true }).check();
    await calculatorField.getByRole('checkbox').uncheck();

    // Wait for auto-save to propagate the tool override to the hidden form input.
    await expect(async () => {
      const hiddenZones = await page.locator('input[name="zones"]').inputValue();
      const parsedZones = JSON.parse(hiddenZones);
      expect(parsedZones[1].tools?.calculator?.enabled).toBe(false);
    }).toPass({ timeout: 5000 });

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Assessment questions updated successfully')).toBeVisible();

    const savedAssessment = await readInfoAssessment(testCoursePath);
    expect(savedAssessment.zones[1].tools.calculator).toEqual({
      enabled: false,
      type: 'scientific',
    });
    // Assessment-level tool should remain unchanged
    expect(savedAssessment.tools.calculator.enabled).toBe(true);

    await enterEditMode(page, courseInstance.id, assessment.id);
    await page
      .getByRole('button')
      .filter({ hasText: 'Zone without tool overrides' })
      .first()
      .click();
    await calculatorField.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Advanced', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Advanced', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Assessment questions updated successfully')).toBeVisible();
    expect((await readInfoAssessment(testCoursePath)).zones[1].tools).toBeUndefined();
  });
});

test.describe('Calculator', () => {
  test('accepts keyboard input on first open with empty localStorage', async ({
    page,
    courseInstance,
  }) => {
    const course = await selectCourseByShortName('QA 101');
    const question = await selectQuestionByQid({ qid: 'addNumbers', course_id: course.id });
    const previewUrl = `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`;

    await page.goto(previewUrl);

    // Clear calculator localStorage to simulate a first-time open.
    const storageKey = await page.locator('#calculatorDrawer').getAttribute('data-storage-key');
    await page.evaluate((key) => localStorage.removeItem(key!), storageKey);
    await page.reload();

    // Open the calculator via the toggle button (the empty-localStorage path).
    await page.locator('#calculatorDrawerToggle').click();
    await expect(page.locator('#calculatorDrawer')).toHaveClass(/open/);

    // Click the math field and type via the keyboard.
    const input = page.locator('#calculator-input');
    await input.click();
    await page.keyboard.type('1+2');

    // Verify the input received the keystrokes.
    await expect(async () => {
      const value = await input.evaluate((el) => (el as HTMLElement & { value: string }).value);
      expect(value).toContain('1');
      expect(value).toContain('2');
    }).toPass({ timeout: 5000 });

    // Submit and verify the result.
    await checkPinyinComposition(page);
    await page.keyboard.press('Enter');
    const historyOutput = page.getByTestId('history-output').locator('math-field').first();
    await expect(async () => {
      const value = await historyOutput.evaluate(
        (el) => (el as HTMLElement & { value: string }).value,
      );
      expect(value).toContain('3');
    }).toPass({ timeout: 5000 });
  });

  for (const mode of ['basic', 'scientific'] as const) {
    test(`${mode}: student input, clipboard, history, and responsive keypad`, async ({
      page,
      baseURL,
      testCoursePath,
      courseInstance,
    }) => {
      await configureCalculator(testCoursePath, mode, mode === 'scientific');
      const student = await getOrCreateUser({
        uid: `calculator-${mode}@example.com`,
        name: 'Calculator Student',
        uin: `calc-${mode}`,
      });
      await ensureUncheckedEnrollment({
        userId: student.id,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requiredRole: ['System'],
        actionDetail: 'implicit_joined',
      });
      await page.context().addCookies([
        { name: 'pl2_requested_uid', value: student.uid, url: baseURL },
        { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
      ]);
      await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
      await page.getByRole('link', { name: 'Homework for automatic test suite' }).click();
      await page.getByRole('link', { name: 'Add two numbers' }).click();
      await page.getByRole('button', { name: 'Calculator', exact: true }).click();

      const input = page.getByLabel('Calculator input', { exact: true });
      const output = page.getByLabel('Calculator output', { exact: true });
      await expect(input).toBeVisible();
      await expect(input).toHaveJSProperty('popoverPolicy', 'off');
      await input.pressSequentially('12+34');
      await expectLatex(output, '=46');
      await input.press('Enter');
      await expect(page.getByTestId('history-output')).toHaveCount(1);
      await page.getByRole('button', { name: 'ans', exact: true }).click();
      await input.pressSequentially('+1');
      await expectLatex(output, '=47');
      await checkPinyinComposition(page);

      const prior = await input.evaluate(
        (element) => (element as HTMLElement & { value: string }).value,
      );
      for (const latex of [
        String.raw`\int_0^1 x^2 dx`,
        '∫',
        String.raw`0\times\int_0^1 x^2 dx`,
        String.raw`x\coloneqq 7`,
      ]) {
        await input.evaluate((element, value) => {
          (element as HTMLElement & { value: string }).value = value;
        }, latex);
        await expectLatex(input, prior);
        await input.evaluate((element, value) => {
          const transfer = new DataTransfer();
          transfer.setData('text/plain', value);
          element.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: transfer,
              bubbles: true,
              cancelable: true,
            }),
          );
        }, latex);
        await expectLatex(input, prior);
      }

      const afterRichPaste = await input.evaluate((element) => {
        // Use MathLive's own clipboard serialization to exercise its rich-atom path.
        const source = document.createElement('math-field') as HTMLElement & {
          value: string;
          select(): void;
          _mathfield: { onCopy(event: ClipboardEvent): void };
        };
        document.body.append(source);
        source.value = String.raw`\int_0^1 x^2 dx`;
        source.select();
        const transfer = new DataTransfer();
        source._mathfield.onCopy(new ClipboardEvent('copy', { clipboardData: transfer }));
        source.remove();
        transfer.setData('text/plain', '1');
        transfer.clearData('application/x-latex');
        element.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
        return {
          value: (element as HTMLElement & { value: string }).value,
          rich: transfer.getData('application/json+mathlive'),
        };
      });
      expect(afterRichPaste.rich).not.toBe('');
      expect(afterRichPaste.value).toBe(prior);
      await expectLatex(input, prior);

      if (mode === 'basic') {
        await input.pressSequentially('abcdefghijklmnopqrstuvwxyz');
        await expectLatex(input, prior);
        await expect(page.getByRole('button', { name: 'Scroll left', exact: true })).toHaveCount(0);
      } else {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'Scroll left', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Scroll right', exact: true })).toBeVisible();
        await input.evaluate((element) => {
          (element as HTMLElement & { value: string }).value = String.raw`\sqrt{9}`;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expectLatex(output, '=3');
        await page.getByRole('button', { name: 'Scroll right', exact: true }).click();
        await expect(page.getByRole('button', { name: '7', exact: true })).toBeVisible();
      }
      await page.setViewportSize({ width: 320, height: 720 });
      const calculator = page.getByRole('region', { name: 'Calculator', exact: true });
      const box = (await calculator.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      await page.reload();
      await expect(input).toBeVisible();
      await expect(page.getByTestId('history-output')).toHaveCount(1);
    });
  }

  test('restored history keeps storage indexes aligned after rejecting entries', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    await configureCalculator(testCoursePath, 'scientific');
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    await page.getByRole('link', { name: 'Homework for automatic test suite' }).click();
    await page.getByRole('link', { name: 'Add two numbers' }).click();
    await page.getByRole('button', { name: 'Calculator', exact: true }).click();
    const calculator = page.getByRole('region', { name: 'Calculator', exact: true });
    await calculator.evaluate((element) => {
      const key = (element as HTMLElement).dataset.storageKey!;
      const data = JSON.parse(localStorage.getItem(key)!);
      data.history = [
        { input: String.raw`\sin(90)`, displayed: '1', angleMode: 'deg' },
        { input: String.raw`\int_0^1 x dx`, displayed: '0.5', angleMode: 'rad' },
        { input: String.raw`\cos(0)`, displayed: '1', angleMode: 'rad' },
      ];
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await expect(page.getByTestId('history-output')).toHaveCount(2);
    await page
      .getByTestId('history-output')
      .last()
      .getByRole('button', { name: 'deg', exact: true })
      .click();
    const history = await calculator.evaluate((element) => {
      const key = (element as HTMLElement).dataset.storageKey!;
      return JSON.parse(localStorage.getItem(key)!).history;
    });
    expect(history).toEqual([
      { input: String.raw`\sin(90)`, displayed: '1', angleMode: 'rad' },
      { input: String.raw`\cos(0)`, displayed: '1', angleMode: 'rad' },
    ]);
    await page.reload();
    await expect(page.getByTestId('history-output')).toHaveCount(2);
    await expect(
      page.getByTestId('history-output').last().getByRole('button', { name: 'rad', exact: true }),
    ).toBeVisible();
  });

  test('Compute Engine definitions survive reload without leaking preview changes', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    await configureCalculator(testCoursePath, 'advanced');
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    await page.getByRole('link', { name: 'Homework for automatic test suite' }).click();
    await page.getByRole('link', { name: 'Add two numbers' }).click();
    await page.getByRole('button', { name: 'Calculator', exact: true }).click();
    const input = page.getByLabel('Calculator input', { exact: true });
    const output = page.getByLabel('Calculator output', { exact: true });
    for (const latex of [String.raw`a\coloneqq 7`, String.raw`f(x)\coloneqq x^2+1`]) {
      await input.evaluate((element, value) => {
        (element as HTMLElement & { value: string }).value = value;
      }, latex);
      await input.press('Enter');
    }
    await expect(page.getByTestId('history-output')).toHaveCount(2);
    await input.evaluate((element) => {
      (element as HTMLElement & { value: string }).value = String.raw`a\coloneqq 99`;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expectLatex(output, '=99');
    await input.evaluate((element) => {
      (element as HTMLElement & { value: string }).value = 'f(3)+a';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expectLatex(output, '=17');
    await page.reload();
    await expectLatex(output, '=17');
  });

  test('advanced provides all unrestricted panels', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    await configureCalculator(testCoursePath, 'advanced');
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    await page.getByRole('link', { name: 'Homework for automatic test suite' }).click();
    await page.getByRole('link', { name: 'Add two numbers' }).click();
    await page.getByRole('button', { name: 'Calculator', exact: true }).click();
    const tabs = page.getByRole('group', { name: 'Calculator keyboard subgroup panel' });
    await expect(tabs.getByRole('radio')).toHaveCount(3);
    await expect(tabs.getByRole('radio', { name: 'full', exact: true })).toBeChecked();
    for (const panel of ['abc', 'func', 'full']) {
      await tabs.getByText(panel, { exact: true }).click();
      await expect(tabs.getByRole('radio', { name: panel, exact: true })).toBeChecked();
    }
    const input = page.getByLabel('Calculator input', { exact: true });
    await input.evaluate((element) => {
      (element as HTMLElement & { value: string }).value = String.raw`\int_0^1 x^2 dx`;
    });
    await expect
      .poll(() => input.evaluate((element) => (element as HTMLElement & { value: string }).value))
      .toContain('\\int');
    await page.setViewportSize({ width: 320, height: 720 });
    const calculator = page.getByRole('region', { name: 'Calculator', exact: true });
    expect(await calculator.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  });
});
