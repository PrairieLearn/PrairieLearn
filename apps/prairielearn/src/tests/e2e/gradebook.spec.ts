import type { Page } from '@playwright/test';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface TestStudent {
  uid: string;
  name: string;
  score: number | null;
}

// Test students with varying scores for filter testing
const TEST_STUDENTS: TestStudent[] = [
  { uid: 'test_student1@test.com', name: 'Test Student 1', score: 95 },
  { uid: 'test_student2@test.com', name: 'Test Student 2', score: 85 },
  { uid: 'test_student3@test.com', name: 'Test Student 3', score: 100 },
  { uid: 'test_student4@test.com', name: 'Test Student 4', score: null },
  { uid: 'test_student5@test.com', name: 'Test Student 5', score: 75 },
  { uid: 'test_student6@test.com', name: 'Test Student 6', score: 92 },
  { uid: 'test_student7@test.com', name: 'Test Student 7', score: null },
];

// Expected count of students with score > 90
const EXPECTED_STUDENTS_ABOVE_90 = TEST_STUDENTS.filter(
  (s) => s.score !== null && s.score > 90,
).length;

const AssessmentInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
});

let assessmentLabel: string;

/**
 * Creates test students with assessment scores for gradebook filter testing.
 * Returns the assessment label for use in tests.
 */
async function createTestData(ciId: string): Promise<string> {
  const assessment = await sqldb.queryRow(
    sql.select_first_assessment,
    { course_instance_id: ciId },
    AssessmentInfoSchema,
  );

  for (const student of TEST_STUDENTS) {
    const userId = await sqldb.queryScalar(
      sql.insert_or_update_user,
      { uid: student.uid, name: student.name },
      z.string(),
    );

    await sqldb.execute(sql.insert_enrollment, { user_id: userId, course_instance_id: ciId });

    if (student.score !== null) {
      await sqldb.execute(sql.insert_assessment_instance, {
        assessment_id: assessment.id,
        user_id: userId,
        score_perc: student.score,
      });
    }
  }

  return assessment.label;
}

/**
 * Scrolls the gradebook table horizontally until the target filter button
 * appears in the DOM. The table uses column virtualization, so off-screen
 * columns are not rendered until scrolled into view.
 */
async function scrollToFilterButton(page: Page, label: string) {
  const btnSelector = `button[aria-label="Filter ${label}"]`;
  const btn = page.locator(btnSelector);
  if ((await btn.count()) > 0) return;
  // Scroll inside the browser in a single evaluate call to avoid round-trip overhead.
  // The table uses column virtualization, so we scroll incrementally until the
  // target element appears in the DOM.
  const scrollContainer = page.getByTestId('table-scroll-container');
  await scrollContainer.evaluate(
    (el, selector) =>
      new Promise<void>((resolve) => {
        const step = () => {
          if (el.querySelector(selector) || el.scrollLeft >= el.scrollWidth - el.clientWidth) {
            resolve();
            return;
          }
          el.scrollLeft += 300;
          requestAnimationFrame(step);
        };
        step();
      }),
    btnSelector,
  );
}

test.describe('Gradebook column visibility', () => {
  let gradebookUrl: string;

  test.beforeAll(async ({ courseInstance }) => {
    gradebookUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/gradebook`;
    await createTestData(courseInstance.id);
  });

  test('unchecking assessment set properly unchecks the set checkbox', async ({ page }) => {
    await page.goto(gradebookUrl);
    await expect(page).toHaveTitle(/Gradebook/);

    // Open the View dropdown
    const viewButton = page.locator('#column-manager');
    await viewButton.click();

    // Find the Homeworks group checkbox (it should be an input with aria-label containing "Homeworks")
    const homeworksCheckbox = page.locator('input[aria-label*="Homeworks"]');
    await expect(homeworksCheckbox).toBeVisible();

    // Verify it's initially checked
    await expect(homeworksCheckbox).toBeChecked();

    // Uncheck the Homeworks group
    await homeworksCheckbox.click();

    // Verify the checkbox is now unchecked (this was the bug - it stayed checked before the fix)
    await expect(homeworksCheckbox).not.toBeChecked();

    // Check it again
    await homeworksCheckbox.click();

    // Verify the checkbox is now checked again
    await expect(homeworksCheckbox).toBeChecked();
  });
});

test.describe('Gradebook numeric filter', () => {
  let gradebookUrl: string;

  test.beforeAll(async ({ courseInstance }) => {
    gradebookUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/gradebook`;
    assessmentLabel = await createTestData(courseInstance.id);
  });

  test('filters table rows when using numeric filter input', async ({ page }) => {
    await page.goto(gradebookUrl);
    await expect(page).toHaveTitle(/Gradebook/);

    // Wait for table to load with all enrolled students
    const tableBody = page.locator('tbody').first();
    await expect(tableBody.locator('tr')).toHaveCount(TEST_STUDENTS.length, { timeout: 10000 });

    // The gradebook uses column virtualization, so the target column may not be
    // in the DOM yet. Scroll the table until the column becomes visible.
    const targetLabel = assessmentLabel.toLowerCase();
    await scrollToFilterButton(page, targetLabel);
    const filterButton = page.locator(`button[aria-label="Filter ${targetLabel}"]`);
    await expect(filterButton).toBeVisible();

    // Open the filter dropdown and apply a filter
    await filterButton.click();
    const filterInput = page.getByPlaceholder('e.g., >0, <5, =10');
    await expect(filterInput).toBeVisible();
    await filterInput.fill('>90');
    await expect(filterInput).toHaveValue('>90');

    // Close dropdown and wait for filter to apply
    await page.keyboard.press('Escape');
    await expect(filterButton.locator('i')).toHaveClass(/bi-funnel-fill/);

    // Verify filtered row count
    await expect(tableBody.locator('tr')).toHaveCount(EXPECTED_STUDENTS_ABOVE_90);

    // Verify "Showing X of Y users" text
    const showingText = page.locator('text=/Showing \\d+ of \\d+ users/');
    await expect(showingText).toContainText(`Showing ${EXPECTED_STUDENTS_ABOVE_90} of`);
  });

  test('shows only rows matching the filter criteria', async ({ page }) => {
    await page.goto(gradebookUrl);

    const tableBody = page.locator('tbody').first();
    await expect(tableBody.locator('tr')).toHaveCount(TEST_STUDENTS.length, { timeout: 10000 });

    const targetLabel = assessmentLabel.toLowerCase();
    await scrollToFilterButton(page, targetLabel);
    const filterButton = page.locator(`button[aria-label="Filter ${targetLabel}"]`);
    await expect(filterButton).toBeVisible();

    // Apply the filter
    await filterButton.click();
    await page.getByPlaceholder('e.g., >0, <5, =10').fill('>90');
    await page.keyboard.press('Escape');

    // Wait for filter to be applied
    await expect(filterButton.locator('i')).toHaveClass(/bi-funnel-fill/);
    await expect(tableBody.locator('tr')).toHaveCount(EXPECTED_STUDENTS_ABOVE_90);

    // Verify each filtered row's UID corresponds to a test student with score > 90.
    // The UID column is pinned and always visible.
    const rows = tableBody.locator('tr');
    const rowCount = await rows.count();
    const expectedUids = TEST_STUDENTS.filter((s) => s.score !== null && s.score > 90).map(
      (s) => s.uid,
    );

    for (let i = 0; i < rowCount; i++) {
      const uidCell = rows.nth(i).locator('td').first();
      const uidText = (await uidCell.textContent())?.trim() ?? '';
      expect(uidText).not.toBe('');
      expect(expectedUids).toContain(uidText);
    }
  });
});
