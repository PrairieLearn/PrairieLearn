import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

// Tests in this suite modify the same question file, so they must run serially
test.describe.configure({ mode: 'serial' });

test.describe('Question settings', () => {
  let questionId: string;

  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();

    // Get question ID after sync
    questionId = (await selectQuestionByQid({ qid: 'addNumbers', course_id: '1' })).id;
  });

  test('edits title and verifies persistence to disk', async ({ page, testCoursePath }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');
    const originalInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(originalInfo.title).toBe('Add two numbers');

    // Wait for the form to be present
    const form = page.locator('form[name="edit-question-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    // Wait for hydration - the save button should be present and the form should have data
    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible({ timeout: 10000 });

    // Wait for the title input to have a value (indicates hydration is complete)
    const titleInput = page.locator('#title');
    await expect(titleInput).toHaveValue('Add two numbers', { timeout: 15000 });

    // Now edit the title
    await titleInput.click();
    await titleInput.fill('Updated title from e2e test');

    // The save button should now be enabled
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // Click save
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);

    // Wait for success message
    await expect(page.locator('.alert-success')).toBeVisible();

    // Verify persistence
    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(updatedInfo.title).toBe('Updated title from e2e test');
  });

  test('edits topic using ComboBox and verifies persistence', async ({ page, testCoursePath }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');

    // Wait for the form and hydration
    const form = page.locator('form[name="edit-question-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    const titleInput = page.locator('#title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible();

    // Click the Topic ComboBox button to open the dropdown
    const topicComboBoxButton = page.locator('[aria-label="Show suggestions"]').first();
    await topicComboBoxButton.click();

    // Wait for listbox and select Calculus
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 5000 });
    await listbox.getByText('Calculus', { exact: true }).click();

    // Save
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.locator('.alert-success')).toBeVisible();

    // Verify
    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(updatedInfo.topic).toBe('Calculus');
  });

  test('toggles single variant checkbox and verifies persistence', async ({
    page,
    testCoursePath,
  }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');
    const originalInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    const originalSingleVariant = originalInfo.singleVariant ?? false;

    // Wait for the form and hydration
    const form = page.locator('form[name="edit-question-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    const titleInput = page.locator('#title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible();

    // Click the checkbox
    const singleVariantCheckbox = page.locator('#single_variant');
    await singleVariantCheckbox.click();

    // Save
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.locator('.alert-success')).toBeVisible();

    // Verify
    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    if (originalSingleVariant) {
      expect(updatedInfo.singleVariant).toBeFalsy();
    } else {
      expect(updatedInfo.singleVariant).toBe(true);
    }
  });

  test('changes grading method select and verifies persistence', async ({
    page,
    testCoursePath,
  }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');

    // Wait for the form and hydration
    const form = page.locator('form[name="edit-question-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    const titleInput = page.locator('#title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible();

    // Change grading method
    const gradingMethodSelect = page.locator('#grading_method');
    await gradingMethodSelect.selectOption('Manual');

    // Save
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.locator('.alert-success')).toBeVisible();

    // Verify
    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(updatedInfo.gradingMethod).toBe('Manual');
  });
});
