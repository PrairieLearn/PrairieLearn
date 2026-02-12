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

    const form = page.locator('form[name="edit-question-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible({ timeout: 10000 });

    const titleInput = page.locator('#title');
    await expect(titleInput).toHaveValue('Add two numbers', { timeout: 15000 });

    await titleInput.click();
    await titleInput.fill('Updated title from e2e test');

    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);

    await expect(page.locator('.alert-success')).toBeVisible();

    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(updatedInfo.title).toBe('Updated title from e2e test');
  });

  test('edits topic using ComboBox and verifies persistence', async ({ page, testCoursePath }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');

    const form = page.locator('form[name="edit-question-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    const titleInput = page.locator('#title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible();

    const topicComboBoxButton = page.locator('[aria-label="Show suggestions"]').first();
    await topicComboBoxButton.click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 5000 });
    await listbox.getByText('Calculus', { exact: true }).click();

    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.locator('.alert-success')).toBeVisible();

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

    const form = page.locator('form[name="edit-question-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    const titleInput = page.locator('#title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible();

    const singleVariantCheckbox = page.locator('#single_variant');
    await singleVariantCheckbox.click();

    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.locator('.alert-success')).toBeVisible();

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

    const form = page.locator('form[name="edit-question-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    const titleInput = page.locator('#title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible();

    const gradingMethodSelect = page.locator('#grading_method');
    await gradingMethodSelect.selectOption('Manual');

    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.locator('.alert-success')).toBeVisible();

    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(updatedInfo.gradingMethod).toBe('Manual');
  });
});
