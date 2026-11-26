import fs from 'node:fs/promises';

import { z } from 'zod';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';

import { insertCoursePermissionsByUserUid } from '../../../models/course-permissions.js';
import {
  selectActivePrintFormsForAssessment,
  selectOptionalPrintForm,
} from '../../../models/print-form.js';
import { syncCourse } from '../../helperCourse.js';
import { expect } from '../fixtures.js';

import {
  ACTIVE_PREVIEW_FRAME_SELECTOR,
  assessmentFor,
  clearPrintPreparationState,
  downloadMenu,
  openPrintPreparation,
  preparePreview,
  printFormLabel,
  test,
  viewer,
  viewerTest,
} from './print-preparation-utils.js';
import { createPrintableForm } from './utils.js';

const sql = loadSqlEquiv(import.meta.url);

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ courseInstance }) => {
  await clearPrintPreparationState(courseInstance.id);
});

viewerTest(
  'lets course viewers preview existing forms without changing them',
  async ({ page, courseInstance }) => {
    const assessment = await assessmentFor(courseInstance.id);
    await insertCoursePermissionsByUserUid({
      course_id: courseInstance.course_id,
      uid: viewer.uid,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print`,
    );
    await expect(page.getByRole('heading', { name: 'No forms yet' })).toBeVisible();
    expect(await selectActivePrintFormsForAssessment({ assessmentId: assessment.id })).toHaveLength(
      0,
    );

    await createPrintableForm(courseInstance, 'exam20-assessmentTools');
    await page.route('**/print_form/*/preview?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html data-print-status="error" data-print-error="Temporary preview error"></html>',
      }),
    );
    await page.reload();
    await expect(page.getByRole('button', { name: /^Form A1(?: Previewing)?$/ })).toBeVisible();
    await expect(page.getByLabel('Paper size')).toBeDisabled();
    await expect(page.getByLabel('Space per question')).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'Include question 1' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add form' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Regenerate Form A1' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Archive Form A1' })).toHaveCount(0);
    await expect(page.getByLabel('Custom cover pages (PDF)')).toBeHidden();

    await expect(page.getByText('Temporary preview error')).toBeVisible();
    await page.unroute('**/print_form/*/preview?*');
    await page.getByRole('button', { name: 'Update preview' }).click();
    await expect(page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR).locator(':root')).toHaveAttribute(
      'data-print-status',
      'ready',
      { timeout: 120_000 },
    );
    await expect(downloadMenu(page)).toHaveCount(0);
  },
);

test('keeps an unsaved student-fields draft when another tab updates the shared form', async ({
  page,
  courseInstance,
}) => {
  const assessment = await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const otherTab = await page.context().newPage();
  await otherTab.goto(page.url());
  await expect(otherTab.getByLabel('Space per question')).toBeEnabled();

  await page.bringToFront();
  await page.getByLabel('Additional student fields:').fill('Section\nRoom');
  await otherTab.bringToFront();
  await otherTab.getByLabel('Space per question').selectOption('half');
  const printFormId = new URL(page.url()).searchParams.get('form')!;
  await expect
    .poll(
      async () =>
        (await selectOptionalPrintForm({ printFormId, assessmentId: assessment.id }))?.settings
          .blockSize,
    )
    .toBe('half');

  const formsRefreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith('/printForms.list'),
    { timeout: 15_000 },
  );
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await formsRefreshed;
  await expect(page.getByLabel('Additional student fields:')).toHaveValue('Section\nRoom');
  await expect(page.getByLabel('Space per question')).toHaveValue('half');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await selectOptionalPrintForm({ printFormId, assessmentId: assessment.id }))?.settings
          .identityFields,
    )
    .toBe('Section\nRoom');
  await expect(downloadMenu(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Update preview' }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await otherTab.close();
});

test('keeps a failed autosave edit available for Update preview', async ({
  page,
  courseInstance,
}) => {
  const assessment = await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const printFormId = new URL(page.url()).searchParams.get('form')!;
  await page.route('**/printForms.updateSettings', (route) => route.abort(), { times: 1 });
  await page.getByLabel('Space per question').selectOption('half');
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await selectOptionalPrintForm({ printFormId, assessmentId: assessment.id }))?.settings
          .blockSize,
    )
    .toBe('half');
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
});

test('saves form edits without requiring a preview refresh before form actions', async ({
  page,
  courseInstance,
}) => {
  const assessment = await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const formAId = new URL(page.url()).searchParams.get('form')!;
  const preview = page.locator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  const previousPreviewUrl = await preview.getAttribute('src');
  await expect(page.getByRole('button', { name: 'Archive Form A1' })).toBeDisabled();

  await page.getByLabel('Paper size').focus();
  await page.getByLabel('Paper size').selectOption('A4');
  await expect
    .poll(
      async () =>
        (await selectOptionalPrintForm({ printFormId: formAId, assessmentId: assessment.id }))
          ?.settings.paperSize,
    )
    .toBe('A4');
  await expect(preview).toHaveAttribute('src', previousPreviewUrl!);
  await expect(downloadMenu(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Paper size')).toBeFocused();
  await page.getByLabel('Spacing for question 1', { exact: true }).selectOption('full');
  await page.getByRole('checkbox', { name: 'Include question 2', exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Add form', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Regenerate Form A1' })).toBeEnabled();

  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Form B1(?: Previewing)?$/ })).toBeVisible();
  const formBId = (await page
    .getByRole('button', { name: /^Form B1(?: Previewing)?$/ })
    .getAttribute('id'))!.replace('print-form-', '');
  await expect(page.getByLabel('Paper size')).toHaveValue('A4');
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toHaveValue('full');
  await expect(page.getByRole('checkbox', { name: 'Include question 2' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Archive Form B1' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Archive Form A1' })).toBeEnabled();

  await page.getByRole('button', { name: 'Form A1', exact: true }).click();
  await expect(page.getByLabel('Paper size')).toHaveValue('A4');
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await preview.evaluate((frame) => {
    (frame as HTMLIFrameElement).contentDocument!.documentElement.dataset.cacheMarker = 'form-a';
  });
  await page.getByRole('button', { name: 'Form B1', exact: true }).click();
  await expect(preview).toHaveAttribute('src', new RegExp(`/print_form/${formBId}/preview`));
  await expect(page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR).locator(':root')).toHaveAttribute(
    'data-print-status',
    'ready',
    { timeout: 120_000 },
  );
  await page.getByRole('button', { name: 'Form A1', exact: true }).click();
  await expect(preview).toHaveAttribute('src', new RegExp(`/print_form/${formAId}/preview`));
  await expect
    .poll(() =>
      preview.evaluate(
        (frame) =>
          (frame as HTMLIFrameElement).contentDocument?.documentElement.dataset.cacheMarker,
      ),
    )
    .toBe('form-a');
  await expect(downloadMenu(page)).toBeEnabled();
});

test('creates Form A1 on first visit and recovers if automatic creation fails', async ({
  page,
  courseInstance,
}) => {
  const assessment = await assessmentFor(courseInstance.id, 'exam18-lockpoints');
  const attemptsBefore = await queryScalar(
    sql.count_assessment_instances,
    { assessment_id: assessment.id },
    z.number(),
  );
  const formsBefore = await queryScalar(
    sql.count_print_forms,
    { assessment_id: assessment.id },
    z.number(),
  );
  expect(formsBefore).toBe(0);
  await page.route('**/printForms.ensureInitial', (route) => route.abort('failed'), {
    times: 1,
  });
  await openPrintPreparation(page, courseInstance.id, 'exam18-lockpoints');

  const creationAlert = page.getByRole('alert').filter({ hasText: 'Could not create Form A1.' });
  await expect(creationAlert).toBeVisible();
  await creationAlert.getByRole('button', { name: 'Try again' }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: /^Form A1(?: Previewing)?$/ })).toBeVisible();
  expect(
    await queryScalar(sql.count_print_forms, { assessment_id: assessment.id }, z.number()),
  ).toBe(formsBefore + 1);
  expect(
    await queryScalar(sql.count_assessment_instances, { assessment_id: assessment.id }, z.number()),
  ).toBe(attemptsBefore);
  const assessmentPage = await page.goto(
    `/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}`,
  );
  expect(assessmentPage?.status()).toBe(200);
});

test('keeps existing forms available when randomization is disabled', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const assessmentFile = `${testCoursePath}/courseInstances/Sp15/assessments/exam20-assessmentTools/infoAssessment.json`;
  const questionFile = `${testCoursePath}/questions/partialCredit3/info.json`;
  const originalAssessment = await fs.readFile(assessmentFile, 'utf8');
  const originalQuestion = await fs.readFile(questionFile, 'utf8');
  const assessmentInfo = {
    ...JSON.parse(originalAssessment),
    shuffleQuestions: true,
    zones: [
      { numberChoose: 1, questions: [{ id: 'partialCredit3', autoPoints: 10, numberChoose: 1 }] },
    ],
  };
  try {
    await fs.writeFile(
      questionFile,
      JSON.stringify({ ...JSON.parse(originalQuestion), singleVariant: true }),
    );
    await fs.writeFile(assessmentFile, JSON.stringify(assessmentInfo));
    await syncCourse(testCoursePath);
    await openPrintPreparation(page, courseInstance.id);
    await expect(page.getByRole('heading', { name: 'Print forms', exact: true })).toBeVisible();
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Add form', exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Preview form', exact: true }).getByRole('option'),
    ).toHaveCount(2);
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    assessmentInfo.shuffleQuestions = false;
    await fs.writeFile(assessmentFile, JSON.stringify(assessmentInfo));
    await syncCourse(testCoursePath);
    await page.reload();
    await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
    await expect(page.getByRole('heading', { name: 'Print forms', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add form', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('combobox', { name: 'Preview form', exact: true }).getByRole('option'),
    ).toHaveCount(2);
    await downloadMenu(page).click();
    await expect(
      page.getByRole('button', {
        name: `Download Form ${await printFormLabel(page)} (PDF)`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Download all forms PDF', exact: true }),
    ).toBeVisible();
  } finally {
    await fs.writeFile(assessmentFile, originalAssessment);
    await fs.writeFile(questionFile, originalQuestion);
    await syncCourse(testCoursePath);
  }
});

test('lets instructors choose grading and pledge content on the cover', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  const pledge = page.getByRole('checkbox', {
    name: 'Include honor code',
    exact: true,
  });
  const grading = page.getByRole('checkbox', { name: 'Include grading table', exact: true });
  await expect(pledge).toBeChecked();
  await expect(grading).not.toBeChecked();
  await grading.check();
  await pledge.uncheck();
  await preparePreview(page);
  const frame = page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  await expect(frame.getByRole('region', { name: 'Grading table' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Honor code' })).toHaveCount(0);
  await pledge.check();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(frame.getByRole('heading', { name: 'Honor code' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Include default cover page', exact: true }).uncheck();
  await expect(pledge).toHaveCount(0);
  await expect(grading).toHaveCount(0);
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator('.assessment-cover')).toHaveCount(0);
});
