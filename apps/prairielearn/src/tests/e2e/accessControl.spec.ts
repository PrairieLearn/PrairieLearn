import type { Page } from '@playwright/test';

import * as sqldb from '@prairielearn/postgres';

import { AssessmentAccessControlSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

let courseInstanceId: string;
let assessmentId: string;

/**
 * Sets up test data - enables the feature and gets required IDs.
 */
async function createTestData() {
  const course = await selectCourseByShortName('QA 101');
  const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
  courseInstanceId = courseInstance.id;

  // Get an assessment to test with - use hw-accessControl which is designed for testing
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstanceId,
    tid: 'hw-accessControl',
  });
  assessmentId = assessment.id;

  // Enable the enhanced-access-control feature globally
  // The route handlers check features.enabled() without context, so we enable globally
  await features.enable('enhanced-access-control');
}

async function getAccessControlRecords(assessmentId: string) {
  return sqldb.queryRows(
    sql.select_access_controls,
    { assessment_id: assessmentId },
    AssessmentAccessControlSchema,
  );
}

test.describe('Access control UI', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();
    await createTestData();
  });

  test('can view access control page with enhanced UI', async ({ page }) => {
    await page.goto(
      `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
    );
    await expect(page).toHaveTitle(/Access/);

    // The enhanced access control UI should be visible
    // Look for the section headings
    await expect(page.getByRole('heading', { name: 'Main Rule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overrides' })).toBeVisible();

    // Should have an "Add override" button
    await expect(page.getByRole('button', { name: /Add override/i })).toBeVisible();
  });

  test('can navigate to create new override page', async ({ page }) => {
    await page.goto(
      `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
    );

    // Click "Add override" button
    await page.getByRole('button', { name: /Add override/i }).click();

    // Should navigate to the new override page
    await expect(page).toHaveURL(/\/access\/new$/);

    // The form should be displayed with "New override" title
    await expect(page.getByRole('heading', { name: 'New override' })).toBeVisible();

    // Should have Cancel link and Create button
    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create override' })).toBeVisible();
  });

  test('can create a new override with minimal settings', async ({ page }) => {
    await page.goto(
      `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access/new`,
    );

    // The form should be displayed with "New override" title
    await expect(page.getByRole('heading', { name: 'New override' })).toBeVisible();

    // The override should be enabled by default (check for enabled button)
    await expect(page.getByRole('button', { name: /Enabled/i })).toBeVisible();

    // Click "Create override" to submit the form
    await page.getByRole('button', { name: 'Create override' }).click();

    // Should redirect back to the access control page on success
    await expect(page).toHaveURL(
      `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
    );

    // Should show a success flash message
    await expect(page.getByText('Override created successfully')).toBeVisible();

    // Verify the override was persisted in the database
    const records = await getAccessControlRecords(assessmentId);
    const overrides = records.filter((r) => r.number != null && r.number > 0);
    expect(overrides.length).toBeGreaterThan(0);
    expect(overrides[0].enabled).toBe(true);
  });

  test('can navigate to edit main rule page', async ({ page }) => {
    await page.goto(
      `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
    );

    // Find and click the edit button for the main rule
    // The main rule card should have an "Edit" button
    const mainRuleSection = page.locator('section').filter({ hasText: 'Main Rule' }).first();
    await mainRuleSection.getByRole('button', { name: /Edit/i }).click();

    // Should navigate to the main rule edit page (either /new?type=main or /{id})
    await expect(page).toHaveURL(/\/access\/(\d+|new\?type=main)$/);

    // Should show the main rule title
    await expect(page.getByRole('heading', { level: 5 })).toBeVisible();
  });

  test('can cancel creating an override', async ({ page }) => {
    await page.goto(
      `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access/new`,
    );

    // Click Cancel to go back
    await page.getByRole('link', { name: 'Cancel' }).click();

    // Should be back at the access control list page
    await expect(page).toHaveURL(
      `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
    );
  });
});
