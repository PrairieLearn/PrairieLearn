import type { Locator } from '@playwright/test';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Creates test students with assessment scores for gradebook filter testing
 */
async function createTestData() {
  // Get the first assessment from the course
  const assessmentId = await sqldb.queryRow(sql.select_first_assessment, {}, z.string());

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
      sql.insert_or_update_user,
      { uid: student.uid, name: student.name },
      z.string(),
    );

    // Enroll in course instance with "joined" status
    await sqldb.execute(sql.insert_enrollment, { user_id: userId });

    // Create assessment instance with score
    if (student.score !== null) {
      await sqldb.execute(sql.insert_assessment_instance, {
        assessment_id: assessmentId,
        user_id: userId,
        score_perc: student.score,
      });
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
    const enrollmentCount = await sqldb.queryRow(sql.count_enrollments, {}, z.number());
    expect(enrollmentCount).toBe(7);

    // Navigate directly to the gradebook page
    await page.goto('/pl/course_instance/1/instructor/instance_admin/gradebook');

    // Wait for the gradebook page to load
    await expect(page).toHaveTitle(/Gradebook/);

    // Wait for table to load - the default filter shows only "Student" role with "joined" status
    const tableBody = page.locator('tbody').first();
    await expect(tableBody.locator('tr')).toHaveCount(7, { timeout: 10000 });

    // Find a column that has actual numeric scores (contains '%')
    // We need to find which column has our test data
    const allHeaders = await page.locator('thead th').all();
    let columnIndex = -1;
    let assessmentFilterButton: Locator | null = null;

    // Look for an assessment column that has scores (not all dashes)
    for (let i = 0; i < allHeaders.length; i++) {
      const header = allHeaders[i];
      // Check if this header has a numeric filter button (assessment columns have these)
      const filterButton = header.locator('button[aria-label^="Filter "]');
      const filterCount = await filterButton.count();
      if (filterCount === 0) continue;

      // Check if any row in this column has a percentage value
      const firstCellWithPercent = tableBody.locator(`tr td:nth-child(${i + 1})`).first();
      const cellText = await firstCellWithPercent.textContent();
      if (cellText?.includes('%')) {
        columnIndex = i;
        assessmentFilterButton = filterButton;
        break;
      }
    }

    expect(columnIndex).toBeGreaterThanOrEqual(0);
    expect(assessmentFilterButton).not.toBeNull();
    await expect(assessmentFilterButton!).toBeVisible({ timeout: 10000 });

    // Click to open the filter dropdown
    await assessmentFilterButton!.click();

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
    const filterIcon = assessmentFilterButton!.locator('i');
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

    // Verify the "Showing X of Y users" text reflects the filter
    const showingText = page.locator('text=/Showing \\d+ of \\d+ users/');
    await expect(showingText).toBeVisible();
    const text = await showingText.textContent();
    const match = text?.match(/Showing (\d+) of (\d+) users/);
    if (match) {
      const showing = Number.parseInt(match[1]);
      const total = Number.parseInt(match[2]);
      expect(showing).toBeLessThanOrEqual(total);
      expect(showing).toBe(filteredRows);
    }
  });
});
