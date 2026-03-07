import * as sqldb from '@prairielearn/postgres';

import { AssessmentAccessControlSchema } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getAccessControlRecords(assessmentId: string) {
  return sqldb.queryRows(
    sql.select_access_controls,
    { assessment_id: assessmentId },
    AssessmentAccessControlSchema,
  );
}

test.describe('Access control UI', () => {
  let assessmentId: string;

  test.beforeAll(async ({ courseInstance }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw-accessControl',
    });
    assessmentId = assessment.id;
  });

  test('can view access control page with enhanced UI', async ({
    page,
    courseInstance,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessmentId}/access`,
    );
    await expect(page).toHaveTitle(/Access/);

    await expect(page.getByRole('heading', { name: 'Main rule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overrides' })).toBeVisible();

    await expect(page.getByRole('button', { name: /Add override/i })).toBeVisible();
  });

  test('can navigate to create new override page', async ({
    page,
    courseInstance,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessmentId}/access`,
    );

    await page.getByRole('button', { name: /Add override/i }).click();

    await expect(page).toHaveURL(/\/access\/new-override$/);

    await expect(page.getByRole('heading', { name: 'New override' })).toBeVisible();

    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create override' })).toBeVisible();
  });

  test('can create a new override with minimal settings', async ({
    page,
    courseInstance,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessmentId}/access/new-override`,
    );

    await expect(page.getByRole('heading', { name: 'New override' })).toBeVisible();

    await expect(page.getByRole('button', { name: /Enabled/i })).toBeVisible();

    await page.getByRole('button', { name: 'Create override' }).click();

    await expect(page.getByText('Access control saved successfully.')).toBeVisible();

    const records = await getAccessControlRecords(assessmentId);
    const overrides = records.filter((r) => r.number > 0);
    expect(overrides.length).toBeGreaterThan(0);
    expect(overrides[0].enabled).toBe(true);
  });

  test('can navigate to edit main rule page', async ({
    page,
    courseInstance,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessmentId}/access`,
    );

    const mainRuleSection = page
      .getByRole('region')
      .or(page.locator('section'))
      .filter({ hasText: 'Main rule' })
      .first();
    await mainRuleSection.getByRole('link', { name: /Edit/i }).click();

    await expect(page).toHaveURL(/\/access\/(\d+|new\?type=main)$/);

    await expect(page.getByRole('heading', { level: 5 })).toBeVisible();
  });

  test('can cancel creating an override', async ({ page, courseInstance, enableFeatureFlag }) => {
    await enableFeatureFlag('enhanced-access-control');

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessmentId}/access/new-override`,
    );

    await page.getByRole('link', { name: 'Cancel' }).click();

    await expect(page).toHaveURL(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessmentId}/access`,
    );
  });
});
