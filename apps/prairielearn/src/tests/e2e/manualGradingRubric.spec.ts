import type { Locator, Page } from '@playwright/test';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const STUDENT = { uid: 'e2e_rubric_student@test.com', name: 'E2E Rubric Student', uin: 'E2E001' };

let assessmentId: string;

async function addRubricItem(page: Page, rubricTable: Locator): Promise<Locator> {
  const rubricRows = rubricTable
    .locator('tr')
    .filter({ has: page.getByRole('spinbutton', { name: 'Points' }) });
  const previousRowCount = await rubricRows.count();

  await expect(async () => {
    if ((await rubricRows.count()) === previousRowCount + 1) return;

    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(rubricRows).toHaveCount(previousRowCount + 1, { timeout: 2000 });
  }).toPass({ timeout: 10000 });

  return rubricRows.nth(previousRowCount);
}

test.describe('Manual grading rubric submission panel update', () => {
  test.setTimeout(60000);

  test.beforeAll(async ({ courseInstance }) => {
    const student = await getOrCreateUser(STUDENT);

    await ensureUncheckedEnrollment({
      userId: student.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    const assessment = await selectAssessmentByTid({
      tid: 'hw9-internalExternalManual',
      course_instance_id: courseInstance.id,
    });
    assessmentId = assessment.id;
  });

  test('submission panel updates after rubric settings change', async ({
    page,
    baseURL,
    courseInstance,
  }) => {
    await page.context().addCookies([
      { name: 'pl2_requested_uid', value: STUDENT.uid, url: baseURL },
      { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
    ]);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    await page.getByRole('link', { name: 'Homework for Internal, External, Manual' }).click();
    await page
      .getByRole('link', { name: 'Manual Grading: Fibonacci function, file upload' })
      .click();

    // Submit file via direct POST to bypass the Dropzone UI.
    const csrfToken = await page.locator('form input[name="__csrf_token"]').first().inputValue();
    const variantId = await page.locator('form input[name="__variant_id"]').first().inputValue();
    const fileUploadName = await page
      .locator('input[name^="_file_upload"]')
      .first()
      .getAttribute('name');
    await page.request.post(page.url(), {
      form: {
        __csrf_token: csrfToken,
        __variant_id: variantId,
        __action: 'save',
        [fileUploadName!]: JSON.stringify([
          { name: 'fib.py', contents: Buffer.from('def fib(n): return n').toString('base64') },
        ]),
      },
    });

    await page.reload();
    await expect(page.locator('[data-testid="submission-status"] .badge').first()).toContainText(
      'waiting for grading',
    );

    await page.context().clearCookies();

    const iqId = await sqldb.queryScalar(
      sql.select_instance_question_for_manual_grading,
      { assessment_id: assessmentId, qid: 'manualGrade/codeUpload' },
      IdSchema,
    );

    const manualGradingIQUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessmentId}/manual_grading/instance_question/${iqId}`;
    await page.goto(manualGradingIQUrl);

    await expect(page.locator('[data-testid="submission-status"] .badge').first()).toContainText(
      'waiting for grading',
    );
    await expect(page.locator('[data-testid^="rubric-item-container-"]')).toHaveCount(0);

    // Set up a rubric and grade the submission.
    await page.locator('[aria-label="Toggle rubric settings"]').click();
    await expect(page.locator('#rubric-setting')).toBeVisible();

    const rubricTable = page.locator('#rubric-editor table[aria-label="Rubric items"] tbody');
    const firstRow = await addRubricItem(page, rubricTable);
    await firstRow.getByRole('spinbutton', { name: 'Points' }).fill('6');
    await firstRow
      .getByRole('textbox', { name: 'Description' })
      .fill('Full credit for correct solution');

    await page.locator('#rubric-setting').getByRole('button', { name: 'Save' }).click();
    await expect(
      page.locator('.js-main-grading-panel .js-selectable-rubric-item').first(),
    ).toBeVisible({ timeout: 10000 });

    await page.locator('.js-selectable-rubric-item').first().check();
    await page.locator('form[name="manual-grading-form"] textarea').fill('Good work on this!');
    // Use #grade-button — there's also a hidden group-grading button.
    await page.locator('#grade-button').click();

    // After grading, PL redirects to the next IQ to grade. Navigate back.
    await page.waitForLoadState('load');
    await page.goto(manualGradingIQUrl);
    await expect(page.locator('[data-testid="submission-status"] .badge').first()).toBeVisible();

    // Set a DOM marker to verify no full page reload occurs after saving rubric settings.
    await page.evaluate(() => {
      document.body.setAttribute('data-e2e-no-reload', 'true');
    });

    await page.locator('[aria-label="Toggle rubric settings"]').click();
    await expect(page.locator('#rubric-setting')).toBeVisible();

    const newRow = await addRubricItem(page, rubricTable);
    await newRow.getByRole('spinbutton', { name: 'Points' }).fill('3');
    await newRow.getByRole('textbox', { name: 'Description' }).fill('Partial credit');

    await page.locator('#rubric-setting').getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.js-main-grading-panel .js-selectable-rubric-item')).toHaveCount(2, {
      timeout: 10000,
    });
    await expect(page.locator('body[data-e2e-no-reload="true"]')).toBeVisible();

    // The submission panel should have been replaced via AJAX with updated rubric feedback.
    await expect(
      page
        .locator('[data-testid="submission-with-feedback"] [data-testid^="rubric-item-container-"]')
        .first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page
        .locator('[data-testid="submission-with-feedback"] [data-testid="rubric-item-points"]')
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-testid="submission-with-feedback"] [data-testid="rubric-item-description"]')
        .first(),
    ).toBeVisible();
  });
});
