import fs from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import * as sqldb from '@prairielearn/postgres';

import { AssessmentAccessControlRuleSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { TEST_COURSE_PATH } from '../../lib/paths.js';
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

async function readAssessmentJson(testCoursePath: string) {
  const filePath = path.join(
    testCoursePath,
    'courseInstances',
    'Sp15',
    'assessments',
    ASSESSMENT_TID,
    'infoAssessment.json',
  );
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function navigateToAccessPage(page: Page, courseInstanceId: string, assessmentId: string) {
  await page.goto(
    `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
  );
  await page.waitForSelector('.js-hydrated-component');
}

/** Returns the split-pane detail panel used for editing rules. */
function getDetailPanel(page: Page): Locator {
  return page.locator('#pl-ui-split-pane-detail');
}

/** Returns the override card containing the given label text. */
function getOverrideCard(page: Page, labelText: string): Locator {
  return page.getByTestId('override-card').filter({ hasText: labelText });
}

test.describe('Access control UI', () => {
  // Restore the original infoAssessment.json and re-sync before each test so
  // that mutations from one test (which are committed to git by FileModifyEditor)
  // don't leak into the next.
  test.beforeEach(async ({ testCoursePath }) => {
    const relativePath = path.join(
      'courseInstances',
      'Sp15',
      'assessments',
      ASSESSMENT_TID,
      'infoAssessment.json',
    );
    await fs.copyFile(
      path.join(TEST_COURSE_PATH, relativePath),
      path.join(testCoursePath, relativePath),
    );
    await features.enable('enhanced-access-control');
    await syncCourse(testCoursePath);
  });

  test('can view page with initial data and verify summary', async ({ page, courseInstance }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: ASSESSMENT_TID,
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    await expect(page.getByRole('heading', { name: 'Defaults' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overrides' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add override/i })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Date control' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'After completion' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Time range' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Question visibility' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Score visibility' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Access' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Before release' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Listed for students' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Immediately after completion' })).toBeVisible();

    // Verify Section A override card is visible with its student label badge
    await expect(getOverrideCard(page, 'Section A')).toBeVisible();

    // Save bar is hidden when there are no unsaved changes
    await expect(page.getByRole('button', { name: 'Save' })).toBeHidden();
  });

  test('can add a student-label override, configure it, and save', async ({
    page,
    courseInstance,
    testCoursePath,
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

    // Select "Students by label" radio in "Applies to"
    await panel.getByLabel('Students by label').check();

    // Click "Select labels" dropdown to open it
    await panel.getByRole('button', { name: /Select labels/i }).click();

    // Select "Extra time" from the dropdown menu
    await page.getByRole('checkbox', { name: 'Extra time' }).click();

    // Close the detail panel
    await panel.getByRole('button', { name: 'Close detail panel' }).click();

    // Verify new override card visible with "Extra time" badge
    await expect(getOverrideCard(page, 'Extra time')).toBeVisible();

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Access control updated successfully.')).toBeVisible();

    // Verify DB: new rule with labels
    const records = await getAccessControlRecords(assessment.id);
    const overrides = records.filter((r) => r.number > 0);
    expect(overrides.length).toBe(2); // Section A + Extra time

    // Verify disk: accessControl array has 3 rules (main + 2 overrides)
    const json = await readAssessmentJson(testCoursePath);
    expect(json.accessControl).toHaveLength(3);
    const overrideLabels = json.accessControl.slice(1).map((r: { labels: string[] }) => r.labels);
    expect(overrideLabels).toContainEqual(['Section A']);
    expect(overrideLabels).toContainEqual(['Extra time']);
  });

  test('keeps default validation errors when adding an override', async ({
    page,
    courseInstance,
  }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: ASSESSMENT_TID,
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    await page.getByRole('button', { name: 'Edit' }).first().click();

    const panel = getDetailPanel(page);
    await expect(panel).toBeVisible();

    await panel.getByLabel('PrairieTest').check();
    await expect(panel.getByText('Exam UUID is required')).toBeVisible();

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeDisabled();

    await page.getByRole('button', { name: /Add override/i }).click();

    await expect(panel.getByText('Applies to')).toBeVisible();
    await expect(saveButton).toBeDisabled();
    await expect(page.getByText('Exam UUID is required').first()).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(panel.getByText('Exam UUID is required')).toBeVisible();
  });

  test('can delete an override', async ({ page, courseInstance, testCoursePath }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: ASSESSMENT_TID,
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    const sectionACard = getOverrideCard(page, 'Section A');
    await expect(sectionACard).toBeVisible();

    const initialRecords = await getAccessControlRecords(assessment.id);
    const initialOverrideCount = initialRecords.filter((r) => r.number > 0).length;

    await sectionACard.getByRole('button', { name: /Remove/i }).click();
    await expect(page.getByText('No overrides configured')).toBeVisible();

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Access control updated successfully.')).toBeVisible();

    // Verify DB: override count decreased
    const records = await getAccessControlRecords(assessment.id);
    const overrideCount = records.filter((r) => r.number > 0).length;
    expect(overrideCount).toBe(initialOverrideCount - 1);

    // Verify disk: accessControl array has only 1 rule (main, no overrides)
    const json = await readAssessmentJson(testCoursePath);
    expect(json.accessControl).toHaveLength(1);
    expect(json.accessControl[0].labels).toBeUndefined();
  });

  test('can edit override with duration and question visibility', async ({
    page,
    courseInstance,
    testCoursePath,
  }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: ASSESSMENT_TID,
    });
    await navigateToAccessPage(page, courseInstance.id, assessment.id);

    // Click "Edit" on the Section A override
    await getOverrideCard(page, 'Section A').getByRole('button', { name: /Edit/i }).click();

    const panel = getDetailPanel(page);
    await expect(panel).toBeVisible();

    // Override the duration field
    await panel.getByRole('button', { name: 'Override Time limit' }).click();

    // Enable the time limit checkbox (now rendered as a labeled form check)
    await panel.getByRole('checkbox', { name: 'Time limit' }).check();

    // Verify duration input shows default of 60
    await expect(panel.getByRole('spinbutton')).toHaveValue('60');

    // Override question visibility
    await panel.getByRole('button', { name: 'Override Question visibility' }).click();

    // Select "Hide questions permanently" from the RichSelect dropdown
    await panel.getByRole('button', { name: 'Question visibility', exact: true }).click();
    await page.getByRole('option', { name: /Hide questions permanently/i }).click();

    // Close the detail panel
    await panel.getByRole('button', { name: 'Close detail panel' }).click();

    // Verify summary shows the changes
    await expect(page.getByText('60 minutes')).toBeVisible();
    await expect(page.getByText('Hidden after completion')).toBeVisible();

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Access control updated successfully.')).toBeVisible();

    // Verify DB state
    const records = await getAccessControlRecords(assessment.id);
    const sectionARule = records.find((r) => r.number > 0);
    expect(sectionARule?.date_control_duration_minutes).toBe(60);
    expect(sectionARule?.after_complete_questions_hidden).toBe(true);

    // Verify disk: Section A override has duration and afterComplete
    const json = await readAssessmentJson(testCoursePath);
    const sectionAJson = json.accessControl.find((r: { labels?: string[] }) =>
      r.labels?.includes('Section A'),
    );
    expect(sectionAJson.dateControl.durationMinutes).toBe(60);
    expect(sectionAJson.afterComplete.questions.hidden).toBe(true);
  });
});
