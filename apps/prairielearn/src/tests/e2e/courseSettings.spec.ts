import fs from 'node:fs/promises';
import path from 'node:path';

import { TEST_COURSE_PATH } from '../../lib/paths.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

test.describe('Course settings', () => {
  test('can change course title without affecting original testCourse', async ({
    page,
    testCoursePath,
  }) => {
    // Read original infoCourse.json from the REAL testCourse (not the temp copy)
    const originalContent = await fs.readFile(
      path.join(TEST_COURSE_PATH, 'infoCourse.json'),
      'utf8',
    );
    const originalInfo = JSON.parse(originalContent);
    const originalTitle = originalInfo.title;

    // Sync the temp copy of testCourse to the database
    await syncCourse(testCoursePath);

    // Navigate to home page and find the test course
    await page.goto('/pl');

    // Click on the test course link (QA 101) - this takes us to course admin
    await page.getByRole('link', { name: 'QA 101' }).click();

    // Click on Course settings in the sidebar
    await page.getByRole('link', { name: 'Course settings' }).click();
    await expect(page).toHaveTitle(/Course Settings/);

    // Verify the current title is displayed
    const titleInput = page.locator('#title');
    await expect(titleInput).toHaveValue(originalTitle);

    // Change the title
    const newTitle = 'Modified Test Course Title';
    await titleInput.fill(newTitle);

    // Submit the form
    await page.click('button[name="__action"][value="update_configuration"]');

    // Wait for success message
    await expect(page.locator('.alert-success')).toContainText(
      'Course configuration updated successfully',
    );

    // Verify the title input now shows the new value
    await expect(titleInput).toHaveValue(newTitle);

    // Verify the temp copy was modified
    const tempContent = await fs.readFile(path.join(testCoursePath, 'infoCourse.json'), 'utf8');
    const tempInfo = JSON.parse(tempContent);
    expect(tempInfo.title).toBe(newTitle);

    // Verify the REAL testCourse was NOT modified
    const realContent = await fs.readFile(path.join(TEST_COURSE_PATH, 'infoCourse.json'), 'utf8');
    const realInfo = JSON.parse(realContent);
    expect(realInfo.title).toBe(originalTitle);
  });
});
