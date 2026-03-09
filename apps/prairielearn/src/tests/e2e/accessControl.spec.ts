import type { Locator, Page } from '@playwright/test';

import * as sqldb from '@prairielearn/postgres';

import { AssessmentAccessControlSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getAccessControlRecords(assessmentId: string) {
  return sqldb.queryRows(
    sql.select_access_controls,
    { assessment_id: assessmentId },
    AssessmentAccessControlSchema,
  );
}

async function navigateToAccessPage(page: Page, courseInstanceId: string, assessmentId: string) {
  await page.goto(
    `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
  );
  await page.waitForSelector('.js-hydrated-component');
}

/**
 * Returns the currently visible dialog (offcanvas or modal).
 * Bootstrap only sets aria-modal="true" on the active dialog.
 */
function getVisibleDialog(page: Page): Locator {
  return page.locator('[aria-modal="true"]');
}

test.describe('Access control UI', () => {
  test.beforeAll(async ({ testCoursePath }) => {
    await features.enable('enhanced-access-control');
    await syncCourse(testCoursePath);
  });

  test.afterAll(async () => {
    await features.disable('enhanced-access-control');
  });

  test('can view page with initial data and verify summary', async ({ page, courseInstance }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw-accessControl',
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    await expect(page.getByRole('heading', { name: 'Main rule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overrides' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add override/i })).toBeVisible();

    // Verify Section A override card is visible with its title and student label link
    await expect(page.getByText('Overrides for Section A')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Section A' })).toBeVisible();

    // Save button should be disabled (no unsaved changes)
    await expect(page.getByRole('button', { name: /Save and sync/i })).toBeDisabled();
  });

  test('can edit main rule via drawer and save', async ({ page, courseInstance }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw-accessControl2',
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    // Click Edit on the main rule card
    const mainRuleSection = page.locator('section').filter({ hasText: 'Main rule' }).first();
    await mainRuleSection.getByRole('button', { name: /Edit/i }).click();

    const drawer = getVisibleDialog(page);
    await expect(drawer).toBeVisible();

    // Check "Block access" checkbox
    await drawer.getByLabel('Block access').check();

    // Click "Done" to close the drawer
    await drawer.getByRole('button', { name: 'Done' }).click();
    await expect(drawer).not.toBeVisible();

    // Verify "Blocks access" badge appears on summary card
    await expect(page.getByText('Blocks access').first()).toBeVisible();

    // Save and sync
    await page.getByRole('button', { name: /Save and sync/i }).click();
    await expect(page.getByText('Access control updated successfully.')).toBeVisible();

    // Verify DB state
    const records = await getAccessControlRecords(assessment.id);
    const mainRule = records.find((r) => r.number === 0);
    expect(mainRule?.block_access).toBe(true);

    // Reload page and verify persisted
    await navigateToAccessPage(page, courseInstance.id, assessment.id);
    await expect(page.getByText('Blocks access').first()).toBeVisible();
  });

  test('can add a student-label override, configure it, and save', async ({
    page,
    courseInstance,
  }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw-accessControl3',
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    // Click "Add override" → new card appears and drawer opens
    await page.getByRole('button', { name: /Add override/i }).click();

    const drawer = getVisibleDialog(page);
    await expect(drawer).toBeVisible();

    // Select "Student labels" radio in "Applies to"
    await drawer.getByLabel('Student labels').check();

    // Click "Add student labels" button to open the popover
    await drawer.getByRole('button', { name: /Add student labels/i }).click();

    // Select "Extra time" from the student label list in the popover
    const popover = page.locator('[data-popper-placement]');
    await expect(popover).toBeVisible();
    await popover.getByText('Extra time').click();

    // Click "Add 1 student label" button
    await popover.getByRole('button', { name: /Add 1 student label/i }).click();

    // Click "Done"
    await drawer.getByRole('button', { name: 'Done' }).click();
    await expect(drawer).not.toBeVisible();

    // Verify new override card visible with "Extra time"
    await expect(page.getByText('Overrides for Extra time')).toBeVisible();

    // Save
    await page.getByRole('button', { name: /Save and sync/i }).click();
    await expect(page.getByText('Access control updated successfully.')).toBeVisible();

    // Verify DB: new rule with labels
    const records = await getAccessControlRecords(assessment.id);
    const overrides = records.filter((r) => r.number > 0);
    expect(overrides.length).toBe(2); // Section A + Extra time
  });

  test('can delete an override', async ({ page, courseInstance }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw-accessControl4',
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    // Verify we start with the Section A override
    await expect(page.getByText('Overrides for Section A')).toBeVisible();

    const initialRecords = await getAccessControlRecords(assessment.id);
    const initialOverrideCount = initialRecords.filter((r) => r.number > 0).length;

    // Click "Remove" on the Section A override card
    const overrideCard = page.locator('.card').filter({ hasText: 'Overrides for Section A' });
    await overrideCard.getByRole('button', { name: /Remove/i }).click();

    // Confirm deletion in modal
    const modal = getVisibleDialog(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Delete override rule')).toBeVisible();
    await modal.getByRole('button', { name: 'Delete' }).click();
    await expect(modal).not.toBeVisible();

    // Verify card removed from page
    await expect(page.getByText('No overrides configured')).toBeVisible();

    // Save
    await page.getByRole('button', { name: /Save and sync/i }).click();
    await expect(page.getByText('Access control updated successfully.')).toBeVisible();

    // Verify DB: override count decreased
    const records = await getAccessControlRecords(assessment.id);
    const overrideCount = records.filter((r) => r.number > 0).length;
    expect(overrideCount).toBe(initialOverrideCount - 1);
  });

  test('can edit override with duration and question visibility', async ({
    page,
    courseInstance,
  }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw-accessControl5',
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    // Click "Edit" on the Section A override card
    const overrideCard = page.locator('.card').filter({ hasText: 'Overrides for Section A' });
    await overrideCard.getByRole('button', { name: /Edit/i }).click();

    const drawer = getVisibleDialog(page);
    await expect(drawer).toBeVisible();

    // Override the duration field: find "Time limit" label and click its associated Override button
    await drawer
      .getByText('Time limit', { exact: true })
      .locator('../..')
      .getByRole('button', { name: 'Override' })
      .click();

    // Enable the time limit checkbox (now rendered as a labeled form check)
    await drawer.getByLabel('Time limit').check();

    // Verify duration input shows default of 60
    await expect(drawer.getByRole('spinbutton')).toHaveValue('60');

    // Override question visibility
    await drawer
      .getByText('Question visibility', { exact: true })
      .locator('../..')
      .getByRole('button', { name: 'Override' })
      .click();

    // Select "Hide questions permanently"
    await drawer.getByLabel('Hide questions permanently').check();

    // Click "Done"
    await drawer.getByRole('button', { name: 'Done' }).click();
    await expect(drawer).not.toBeVisible();

    // Verify summary shows the changes
    await expect(page.getByText('Time limit: 60 minutes')).toBeVisible();
    await expect(page.getByText('Questions hidden after completion')).toBeVisible();

    // Save
    await page.getByRole('button', { name: /Save and sync/i }).click();
    await expect(page.getByText('Access control updated successfully.')).toBeVisible();

    // Verify DB state
    const records = await getAccessControlRecords(assessment.id);
    const sectionARule = records.find((r) => r.number > 0);
    expect(sectionARule?.date_control_duration_minutes).toBe(60);
    expect(sectionARule?.after_complete_hide_questions).toBe(true);
  });
});
