import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Page } from '@playwright/test';

import { TEST_COURSE_PATH } from '../../lib/paths.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseByShortName } from '../../models/course.js';
import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

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

test.describe('Assessment tools', () => {
  test.beforeEach(async ({ testCoursePath }) => {
    await resetAssessmentFromTemplate(testCoursePath);
  });

  test('can disable calculator tool in assessment settings', async ({
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

    // Calculator starts enabled in the template
    const calculatorCheckbox = page.getByLabel('Calculator');
    await expect(calculatorCheckbox).toBeChecked();
    await calculatorCheckbox.uncheck();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Assessment updated successfully')).toBeVisible();

    const savedAssessment = await readInfoAssessment(testCoursePath);
    expect(savedAssessment.tools.calculator.enabled).toBe(false);

    // Enable calculator again
    await calculatorCheckbox.check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Assessment updated successfully')).toBeVisible();

    const updatedAssessment = await readInfoAssessment(testCoursePath);
    expect(updatedAssessment.tools.calculator.enabled).toBe(true);
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

    // Uncheck the calculator checkbox to disable it for this zone.
    const calculatorCheckbox = calculatorField.getByRole('checkbox');
    await expect(calculatorCheckbox).toBeChecked();
    await calculatorCheckbox.uncheck();

    // Wait for auto-save to propagate the tool override to the hidden form input.
    await expect(async () => {
      const hiddenZones = await page.locator('input[name="zones"]').inputValue();
      const parsedZones = JSON.parse(hiddenZones);
      expect(parsedZones[1].tools?.calculator?.enabled).toBe(false);
    }).toPass({ timeout: 5000 });

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByText('Assessment questions updated successfully')).toBeVisible();

    const savedAssessment = await readInfoAssessment(testCoursePath);
    expect(savedAssessment.zones[1].tools.calculator.enabled).toBe(false);
    // Assessment-level tool should remain unchanged
    expect(savedAssessment.tools.calculator.enabled).toBe(true);
  });
});

test.describe('Calculator keyboard input', () => {
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
    await page.keyboard.press('Enter');
    const historyOutput = page.getByTestId('history-output').locator('math-field').first();
    await expect(async () => {
      const value = await historyOutput.evaluate(
        (el) => (el as HTMLElement & { value: string }).value,
      );
      expect(value).toContain('3');
    }).toPass({ timeout: 5000 });
  });
});
