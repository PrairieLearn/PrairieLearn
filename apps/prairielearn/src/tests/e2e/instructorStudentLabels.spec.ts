import type { Page } from '@playwright/test';

import { getCourseInstanceStudentLabelsUrl } from '../../lib/client/url.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';

import { expect, test } from './fixtures.js';

let courseInstanceId: string;

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

async function navigateToLabelsPage(page: Page) {
  await page.goto(getCourseInstanceStudentLabelsUrl(courseInstanceId));
  await page.waitForSelector('.js-hydrated-component');
}

test.describe('Instructor student labels', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();

    const course = await selectCourseByShortName('QA 101');
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
    courseInstanceId = courseInstance.id;
  });

  test('can create, edit, and delete a label', async ({ page }) => {
    await navigateToLabelsPage(page);
    await expect(page).toHaveTitle(/Student labels/);

    const timestamp = Date.now().toString().slice(-6);
    const labelName = `E2E Label ${timestamp}`;
    const editedName = `E2E Edited ${timestamp}`;

    // Create a label
    await page.getByRole('button', { name: 'Add label' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Label name').fill(labelName);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('table').getByText(labelName)).toBeVisible();

    // Edit the label
    await page.getByRole('button', { name: `Edit ${labelName}` }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Label name').fill(editedName);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('table').getByText(editedName)).toBeVisible();
    await expect(page.locator('table').getByText(labelName)).not.toBeVisible();

    // Delete the label
    await page.getByRole('button', { name: `Delete ${editedName}` }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('table').getByText(editedName)).not.toBeVisible();
  });
});
