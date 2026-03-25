import type { Locator, Page } from '@playwright/test';

import * as sqldb from '@prairielearn/postgres';

import { AssessmentAccessControlRuleSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const ASSESSMENT_TID = 'hw19-accessControlUi';

async function getAccessControlRecords(assessmentId: string) {
  return sqldb.queryRows(
    sql.select_access_controls,
    { assessment_id: assessmentId },
    AssessmentAccessControlRuleSchema,
  );
}

async function navigateToAccessPage(page: Page, courseInstanceId: string, assessmentId: string) {
  await page.goto(
    `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
  );
  await page.waitForSelector('.js-hydrated-component');
}

/** Returns the split-pane detail panel used for editing rules. */
function getDetailPanel(page: Page): Locator {
  return page.locator('#split-pane-detail');
}

/** Returns the currently visible modal dialog (e.g. delete confirmation). */
function getVisibleModal(page: Page): Locator {
  return page.locator('[aria-modal="true"]');
}

test.describe('Access control UI', () => {
  // Re-sync before each test to reset the assessment back to its on-disk state,
  // so that mutations from one test don't leak into the next.
  test.beforeEach(async ({ testCoursePath }) => {
    await features.enable('enhanced-access-control');
    await syncCourse(testCoursePath);
  });

  test('can view page with initial data and verify summary', async ({ page, courseInstance }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: ASSESSMENT_TID,
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

  test('can add a student-label override, configure it, and save', async ({
    page,
    courseInstance,
  }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: ASSESSMENT_TID,
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    // Click "Add override" → new card appears and detail panel opens
    await page.getByRole('button', { name: /Add override/i }).click();

    const panel = getDetailPanel(page);
    await expect(panel).toBeVisible();

    // Select "Student labels" radio in "Applies to"
    await panel.getByLabel('Student labels').check();

    // Click "Add student labels" button to open the popover
    await panel.getByRole('button', { name: /Add student labels/i }).click();

    // Select "Extra time" from the student label list in the popover
    const popover = page.locator('[data-popper-placement]');
    await expect(popover).toBeVisible();
    await popover.getByText('Extra time').click();

    // Click "Add 1 student label" button
    await popover.getByRole('button', { name: /Add 1 student label/i }).click();

    // Close the detail panel
    await panel.getByRole('button', { name: 'Close detail panel' }).click();

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
      tid: ASSESSMENT_TID,
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    // Verify we start with the Section A override
    await expect(page.getByText('Overrides for Section A')).toBeVisible();

    const initialRecords = await getAccessControlRecords(assessment.id);
    const initialOverrideCount = initialRecords.filter((r) => r.number > 0).length;

    // Click "Remove" on the Section A override
    await page
      .getByText('Overrides for Section A')
      .locator('..')
      .locator('..')
      .getByRole('button', { name: /Remove/i })
      .click();

    // Confirm deletion in modal
    const modal = getVisibleModal(page);
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
      tid: ASSESSMENT_TID,
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    // Click "Edit" on the Section A override
    await page
      .getByText('Overrides for Section A')
      .locator('..')
      .locator('..')
      .getByRole('button', { name: /Edit/i })
      .click();

    const panel = getDetailPanel(page);
    await expect(panel).toBeVisible();

    // Override the duration field: find "Time limit" label and click its associated Override button
    await panel
      .getByText('Time limit', { exact: true })
      .locator('../..')
      .getByRole('button', { name: 'Override' })
      .click();

    // Enable the time limit checkbox (now rendered as a labeled form check)
    await panel.getByLabel('Time limit').check();

    // Verify duration input shows default of 60
    await expect(panel.getByRole('spinbutton')).toHaveValue('60');

    // Override question visibility
    await panel
      .getByText('Question visibility', { exact: true })
      .locator('../..')
      .getByRole('button', { name: 'Override' })
      .click();

    // Select "Hide questions permanently"
    await panel.getByLabel('Hide questions permanently').check();

    // Close the detail panel
    await panel.getByRole('button', { name: 'Close detail panel' }).click();

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
