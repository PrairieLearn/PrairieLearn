import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { syncCourse } from '../helperCourse.js';

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

// Will be set during test setup
let courseInstanceId: string;
let assessmentLabel: string;

async function getCourseInstanceId(): Promise<string> {
  const course = await selectCourseByShortName('XC 101');
  const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'SectionA' });
  return courseInstance.id;
}

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
    const userId = await sqldb.queryRow(
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

test.describe('Gradebook column visibility', () => {
  test.beforeAll(async () => {
    await syncCourse(EXAMPLE_COURSE_PATH);
    courseInstanceId = await getCourseInstanceId();
    await createTestData(courseInstanceId);
  });

  test('unchecking assessment set properly unchecks the set checkbox', async ({ page }) => {
    await page.goto(`/pl/course_instance/${courseInstanceId}/instructor/instance_admin/gradebook`);
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
  test.beforeAll(async () => {
    await syncCourse(EXAMPLE_COURSE_PATH);
    courseInstanceId = await getCourseInstanceId();
    assessmentLabel = await createTestData(courseInstanceId);
  });

  test('filters table rows when using numeric filter input', async ({ page }) => {
    await page.goto(`/pl/course_instance/${courseInstanceId}/instructor/instance_admin/gradebook`);
    await expect(page).toHaveTitle(/Gradebook/);

    // Wait for table to load with all enrolled students
    const tableBody = page.locator('tbody').first();
    await expect(tableBody.locator('tr')).toHaveCount(TEST_STUDENTS.length, { timeout: 10000 });

    // Find the filter button for the assessment we inserted data into
    const filterButton = page.locator(
      `button[aria-label="Filter ${assessmentLabel.toLowerCase()}"]`,
    );
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
    await page.goto(`/pl/course_instance/${courseInstanceId}/instructor/instance_admin/gradebook`);

    const tableBody = page.locator('tbody').first();
    await expect(tableBody.locator('tr')).toHaveCount(TEST_STUDENTS.length, { timeout: 10000 });

    // Find the filter button and its column index for the assessment we inserted data into
    const filterButton = page.locator(
      `button[aria-label="Filter ${assessmentLabel.toLowerCase()}"]`,
    );
    await expect(filterButton).toBeVisible();

    // Get the column index by finding the header cell containing the filter button
    const allHeaders = page.locator('thead th');
    const headerCount = await allHeaders.count();

    let assessmentColumnIndex = -1;
    for (let i = 0; i < headerCount; i++) {
      const header = allHeaders.nth(i);
      const btn = header.locator(`button[aria-label="Filter ${assessmentLabel.toLowerCase()}"]`);
      if ((await btn.count()) > 0) {
        assessmentColumnIndex = i;
        break;
      }
    }
    expect(assessmentColumnIndex).toBeGreaterThanOrEqual(0);

    // Apply the filter
    await filterButton.click();
    await page.getByPlaceholder('e.g., >0, <5, =10').fill('>90');
    await page.keyboard.press('Escape');

    // Wait for filter to be applied
    await expect(filterButton.locator('i')).toHaveClass(/bi-funnel-fill/);
    await expect(tableBody.locator('tr')).toHaveCount(EXPECTED_STUDENTS_ABOVE_90);

    // Verify each visible row has a value > 90 in the filtered column
    const rows = tableBody.locator('tr');
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const cell = rows.nth(i).locator('td').nth(assessmentColumnIndex);
      const cellText = await cell.textContent();
      const cleanText = cellText?.trim() ?? '';

      // Should not see null/empty values with a numeric filter
      expect(cleanText).not.toBe('—');
      expect(cleanText).not.toBe('');

      // Extract the numeric value and verify it's > 90
      const value = Number.parseFloat(cleanText);
      expect(value).toBeGreaterThan(90);
    }
  });
});
