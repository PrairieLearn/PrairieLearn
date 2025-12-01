import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

/**
 * Creates test students with assessment scores for gradebook filter testing
 */
async function createTestData() {
  // Get the first assessment from the course
  const assessmentId = await sqldb.queryRow(
    'SELECT id FROM assessments WHERE course_instance_id = 1 ORDER BY id LIMIT 1',
    {},
    z.string(),
  );

  // Create test students with varying scores
  const students = [
    { uid: 'test_student1@test.com', name: 'Test Student 1', score: 95 }, // > 90
    { uid: 'test_student2@test.com', name: 'Test Student 2', score: 85 }, // <= 90
    { uid: 'test_student3@test.com', name: 'Test Student 3', score: 100 }, // > 90
    { uid: 'test_student4@test.com', name: 'Test Student 4', score: null }, // null
    { uid: 'test_student5@test.com', name: 'Test Student 5', score: 75 }, // <= 90
    { uid: 'test_student6@test.com', name: 'Test Student 6', score: 92 }, // > 90
    { uid: 'test_student7@test.com', name: 'Test Student 7', score: null }, // null
  ];

  for (const student of students) {
    // Insert user
    const userId = await sqldb.queryRow(
      `INSERT INTO users (uid, name, uin)
       VALUES ($uid, $name, $uid)
       ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name
       RETURNING user_id`,
      { uid: student.uid, name: student.name },
      z.string(),
    );

    // Enroll in course instance with "joined" status
    await sqldb.execute(
      `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
       VALUES ($user_id, 1, 'joined', NOW())
       ON CONFLICT DO NOTHING`,
      { user_id: userId },
    );

    // Create assessment instance with score
    if (student.score !== null) {
      await sqldb.execute(
        `INSERT INTO assessment_instances (assessment_id, user_id, score_perc, points, max_points)
         VALUES ($assessment_id, $user_id, $score_perc, $score_perc, 100)`,
        {
          assessment_id: assessmentId,
          user_id: userId,
          score_perc: student.score,
        },
      );
    }
  }
}

test.describe('Gradebook numeric filter', () => {
  test('should allow typing in numeric filter input and filter table rows', async ({ page }) => {
    // Sync the example course
    await syncCourse(EXAMPLE_COURSE_PATH);

    // Create test data
    await createTestData();

    // Verify data was created
    const enrollmentCount = await sqldb.queryRow(
      'SELECT COUNT(*)::integer FROM enrollments WHERE course_instance_id = 1',
      {},
      z.number(),
    );
    expect(enrollmentCount).toBe(7);

    // Navigate directly to the gradebook page
    await page.goto('/pl/course_instance/1/instructor/instance_admin/gradebook');

    // Wait for the gradebook page to load
    await expect(page).toHaveTitle(/Gradebook/);

    // Check current URL to make sure we're on the right page
    console.log('Current URL:', page.url());

    // Look for "Showing" text that appears when there are rows
    const showingTextDebug = await page
      .locator('text=/Showing/')
      .textContent()
      .catch(() => 'Not found');
    console.log('Showing text:', showingTextDebug);

    // Wait for table to load (it may take a moment to populate)
    const tableBody = page.locator('tbody').first();
    await expect(tableBody.locator('tr')).toHaveCount(7, { timeout: 10000 });

    // Find the first assessment filter button (should be HW1 or similar)
    const firstFilterButton = page.locator('button[aria-label*="Filter"]').first();
    await expect(firstFilterButton).toBeVisible({ timeout: 10000 });

    // Get the column index of the filtered column by finding its header
    const filterButtonAriaLabel = await firstFilterButton.getAttribute('aria-label');
    const allHeaders = await page.locator('thead th').all();
    let columnIndex = -1;
    for (let i = 0; i < allHeaders.length; i++) {
      const header = allHeaders[i];
      const hasFilterButton = await header
        .locator(`button[aria-label="${filterButtonAriaLabel}"]`)
        .count();
      if (hasFilterButton > 0) {
        columnIndex = i;
        break;
      }
    }
    expect(columnIndex).toBeGreaterThanOrEqual(0);

    // Click to open the filter dropdown
    await firstFilterButton.click();

    // Find the numeric filter input
    const filterInput = page.getByPlaceholder('e.g., >0, <5, =10');
    await expect(filterInput).toBeVisible();

    // Type a filter value that should reduce the number of visible rows
    await filterInput.fill('>90');

    // Verify the input value was set
    await expect(filterInput).toHaveValue('>90');

    // Close the dropdown
    await page.keyboard.press('Escape');

    // Wait a moment for the filter to be applied
    await page.waitForTimeout(500);

    // The filter icon should now be filled (active)
    const filterIcon = firstFilterButton.locator('i');
    await expect(filterIcon).toHaveClass(/bi-funnel-fill/);

    // Verify that the number of rows has changed (should be exactly 3 students with scores > 90)
    const filteredRows = await tableBody.locator('tr').count();
    expect(filteredRows).toBe(3); // Students with scores 95, 100, 92

    // Verify each visible row has a value > 90 in the filtered column
    // When a numeric filter is set, null values should NOT be present
    const rows = await tableBody.locator('tr').all();
    for (const row of rows) {
      const cells = await row.locator('td').all();
      if (columnIndex < cells.length) {
        const cellText = await cells[columnIndex].textContent();
        const cleanText = cellText?.trim() || '';

        // With a numeric filter, we should NOT see null/empty values
        expect(cleanText).not.toBe('—');
        expect(cleanText).not.toBe('');
        expect(cleanText).not.toBe('N/A');

        // The value should be a number > 90
        const value = Number.parseFloat(cleanText);
        expect(value).not.toBeNaN();
        expect(value).toBeGreaterThan(90);
      }
    }

    // Verify the "Showing X of Y students" text reflects the filter
    const showingText = page.locator('text=/Showing \\d+ of \\d+ students/');
    await expect(showingText).toBeVisible();
    const text = await showingText.textContent();
    const match = text?.match(/Showing (\d+) of (\d+) students/);
    if (match) {
      const showing = Number.parseInt(match[1]);
      const total = Number.parseInt(match[2]);
      expect(showing).toBeLessThanOrEqual(total);
      expect(showing).toBe(filteredRows);
    }
  });

  test('should filter to show only empty values when checkbox is checked', async ({ page }) => {
    // Sync the example course
    await syncCourse(EXAMPLE_COURSE_PATH);

    // Create test data
    await createTestData();

    // Navigate directly to the gradebook page
    await page.goto('/pl/course_instance/1/instructor/instance_admin/gradebook');

    await expect(page).toHaveTitle(/Gradebook/);

    const tableBody = page.locator('tbody').first();
    const initialRows = await tableBody.locator('tr').count();
    expect(initialRows).toBe(7); // 7 students from test data

    // Open the first assessment filter
    const firstFilterButton = page.locator('button[aria-label*="Filter"]').first();
    await expect(firstFilterButton).toBeVisible({ timeout: 10000 });

    // Get the column index of the filtered column
    const filterButtonAriaLabel = await firstFilterButton.getAttribute('aria-label');
    const allHeaders = await page.locator('thead th').all();
    let columnIndex = -1;
    for (let i = 0; i < allHeaders.length; i++) {
      const header = allHeaders[i];
      const hasFilterButton = await header
        .locator(`button[aria-label="${filterButtonAriaLabel}"]`)
        .count();
      if (hasFilterButton > 0) {
        columnIndex = i;
        break;
      }
    }
    expect(columnIndex).toBeGreaterThanOrEqual(0);

    await firstFilterButton.click();

    // The "Only empty" checkbox should be visible
    const onlyEmptyCheckbox = page.getByRole('checkbox', { name: 'Only empty' });
    await expect(onlyEmptyCheckbox).toBeVisible();

    // Check the "Only empty" checkbox
    await onlyEmptyCheckbox.check();
    await expect(onlyEmptyCheckbox).toBeChecked();

    // The numeric input should still be visible but should be disabled
    const filterInput = page.getByPlaceholder('e.g., >0, <5, =10');
    await expect(filterInput).toBeVisible();
    await expect(filterInput).toBeDisabled();

    // Close the dropdown
    await page.keyboard.press('Escape');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // The filter should be active
    const filterIcon = firstFilterButton.locator('i');
    await expect(filterIcon).toHaveClass(/bi-funnel-fill/);

    // Should show exactly 2 students with null scores
    const filteredRows = await tableBody.locator('tr').count();
    expect(filteredRows).toBe(2); // Students 4 and 7 with null scores

    // Verify each visible row has an empty value (—) in the filtered column
    if (filteredRows > 0) {
      const rows = await tableBody.locator('tr').all();
      for (const row of rows) {
        const cells = await row.locator('td').all();
        if (columnIndex < cells.length) {
          const cellText = await cells[columnIndex].textContent();
          const cleanText = cellText?.trim() || '';

          // Should be "—" (the empty value indicator) or empty string
          expect(['—', '', 'N/A']).toContain(cleanText);
        }
      }
    }
  });

  test('should clear filter and restore all rows', async ({ page }) => {
    // Sync the example course
    await syncCourse(EXAMPLE_COURSE_PATH);

    // Create test data
    await createTestData();

    // Navigate directly to the gradebook page
    await page.goto('/pl/course_instance/1/instructor/instance_admin/gradebook');

    await expect(page).toHaveTitle(/Gradebook/);

    const tableBody = page.locator('tbody').first();
    const initialRows = await tableBody.locator('tr').count();
    expect(initialRows).toBe(7); // 7 students from test data

    // Apply a filter first
    const firstFilterButton = page.locator('button[aria-label*="Filter"]').first();
    await expect(firstFilterButton).toBeVisible({ timeout: 10000 });

    // Get the column index
    const filterButtonAriaLabel = await firstFilterButton.getAttribute('aria-label');
    const allHeaders = await page.locator('thead th').all();
    let columnIndex = -1;
    for (let i = 0; i < allHeaders.length; i++) {
      const header = allHeaders[i];
      const hasFilterButton = await header
        .locator(`button[aria-label="${filterButtonAriaLabel}"]`)
        .count();
      if (hasFilterButton > 0) {
        columnIndex = i;
        break;
      }
    }

    await firstFilterButton.click();

    const filterInput = page.getByPlaceholder('e.g., >0, <5, =10');
    await filterInput.fill('>90');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Verify rows are filtered (should be 3 students with scores > 90)
    const filteredRows = await tableBody.locator('tr').count();
    expect(filteredRows).toBe(3);

    // Verify NO null values are visible when numeric filter is active
    const filteredRowsArray = await tableBody.locator('tr').all();
    for (const row of filteredRowsArray) {
      const cells = await row.locator('td').all();
      if (columnIndex < cells.length) {
        const cellText = await cells[columnIndex].textContent();
        const cleanText = cellText?.trim() || '';
        // Should NOT have null values when numeric filter is set
        expect(cleanText).not.toBe('—');
        expect(cleanText).not.toBe('');
        expect(cleanText).not.toBe('N/A');
      }
    }

    // Now clear the filter
    await firstFilterButton.click();
    const clearButton = page.getByRole('button', { name: 'Clear filter' });
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // Close dropdown
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Verify all rows are restored (all 7 students)
    const restoredRows = await tableBody.locator('tr').count();
    expect(restoredRows).toBe(7);

    // Verify that the previously filtered rows are now visible again
    // We should have: 2 null values + 2 low values (<=90) + 3 high values (>90) = 7 total
    let restoredLowValueRows = 0;
    let restoredNullValueRows = 0;
    let restoredHighValueRows = 0;
    const restoredAllRows = await tableBody.locator('tr').all();
    for (const row of restoredAllRows) {
      const cells = await row.locator('td').all();
      if (columnIndex < cells.length) {
        const cellText = await cells[columnIndex].textContent();
        const cleanText = cellText?.trim() || '';
        if (cleanText === '—' || cleanText === '' || cleanText === 'N/A') {
          restoredNullValueRows++;
        } else {
          const value = Number.parseFloat(cleanText);
          if (!Number.isNaN(value)) {
            if (value <= 90) {
              restoredLowValueRows++;
            } else {
              restoredHighValueRows++;
            }
          }
        }
      }
    }
    expect(restoredNullValueRows).toBe(2); // Students 4 and 7
    expect(restoredLowValueRows).toBe(2); // Students 2 (85) and 5 (75)
    expect(restoredHighValueRows).toBe(3); // Students 1 (95), 3 (100), 6 (92)

    // Filter icon should no longer be filled
    const filterIcon = firstFilterButton.locator('i');
    await expect(filterIcon).toHaveClass(/bi-funnel(?!-fill)/);
  });

  test('should show help tooltip button', async ({ page }) => {
    // Sync the example course
    await syncCourse(EXAMPLE_COURSE_PATH);

    // Create test data
    await createTestData();

    // Navigate directly to the gradebook page
    await page.goto('/pl/course_instance/1/instructor/instance_admin/gradebook');

    await expect(page).toHaveTitle(/Gradebook/);

    // Open the first assessment filter
    const firstFilterButton = page.locator('button[aria-label*="Filter"]').first();
    await expect(firstFilterButton).toBeVisible({ timeout: 10000 });
    await firstFilterButton.click();

    // The help button (?) should be visible
    const helpButton = page.getByRole('button', { name: 'Filter help' });
    await expect(helpButton).toBeVisible();

    // Close the dropdown
    await page.keyboard.press('Escape');
  });
});
