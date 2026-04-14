import type { Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { createGroup } from '../../lib/groups.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function impersonateUser(page: Page, uid: string, baseURL: string) {
  await page.context().addCookies([
    { name: 'pl2_requested_uid', value: uid, url: baseURL },
    { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
  ]);
}

async function setupStudent(
  uid: string,
  name: string,
  uin: string,
  courseInstance: { id: string },
) {
  const user = await getOrCreateUser({ uid, name, uin });
  await ensureUncheckedEnrollment({
    userId: user.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });
  return user;
}

/**
 * Navigate to the assessment instance page. The page fixture is recreated
 * between Playwright tests even in serial blocks, so every test that needs
 * the page must call this.
 */
async function goToInstance(
  page: Page,
  baseURL: string,
  courseInstanceId: string,
  assessmentTid: string,
  uid: string,
) {
  await impersonateUser(page, uid, baseURL);

  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstanceId,
    tid: assessmentTid,
  });
  await page.goto(`${baseURL}/pl/course_instance/${courseInstanceId}/assessment/${assessment.id}/`);

  // If already redirected to instance (previously started), we're done
  if (page.url().includes('/assessment_instance/')) {
    await page.waitForLoadState('load');
    await page.waitForLoadState('networkidle');
    return page.url();
  }

  // Accept honor code and start
  const pledgeCheckbox = page.locator('#certify-pledge');
  if (await pledgeCheckbox.isVisible()) {
    await pledgeCheckbox.check();
  }
  await page.locator('#start-assessment').click();
  await page.waitForURL('**/assessment_instance/**');
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle');
  return page.url();
}

async function goToHomeworkInstance(
  page: Page,
  baseURL: string,
  courseInstanceId: string,
  assessmentTid: string,
  uid: string,
) {
  await impersonateUser(page, uid, baseURL);

  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstanceId,
    tid: assessmentTid,
  });
  await page.goto(`${baseURL}/pl/course_instance/${courseInstanceId}/assessment/${assessment.id}/`);
  await page.waitForURL('**/assessment_instance/**');
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle');
  return page.url();
}

// ===================================================================
// 1. Basic Exam (exam18-lockpoints: 3 zones, lockpoints on 2 & 3)
// ===================================================================

test.describe.serial('Basic exam flow', () => {
  const STUDENT = { uid: 'e2e_sai_exam1@test.com', name: 'SAI Exam1', uin: 'SAIEX1' };

  test.beforeAll(async ({ courseInstance }) => {
    await setupStudent(STUDENT.uid, STUDENT.name, STUDENT.uin, courseInstance);
  });

  test('shows question table, status badges, and columns', async ({
    page,
    baseURL,
    courseInstance,
  }) => {
    await goToInstance(page, baseURL, courseInstance.id, 'exam18-lockpoints', STUDENT.uid);

    await expect(page.getByTestId('assessment-questions')).toBeVisible();

    // 3 questions across 3 zones (Q2/Q3 behind lockpoints render as spans)
    await expect(page.getByText('Question 1')).toBeVisible();
    await expect(page.getByText('Question 2')).toBeVisible();
    await expect(page.getByText('Question 3')).toBeVisible();

    await expect(page.getByRole('heading', { name: /E18.*Exam with lockpoints/ })).toBeVisible();

    // Q1: "unanswered", Q2/Q3 behind lockpoints: "Locked"
    await expect(page.getByText('unanswered')).toBeVisible();
    await expect(page.getByText('Locked').first()).toBeVisible();

    await expect(page.getByRole('columnheader', { name: /Available points/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Awarded points/ })).toBeVisible();
  });

  test('can navigate to a question and back', async ({ page, baseURL, courseInstance }) => {
    const instanceUrl = await goToInstance(
      page,
      baseURL,
      courseInstance.id,
      'exam18-lockpoints',
      STUDENT.uid,
    );
    await page.getByRole('link', { name: 'Question 1' }).click();
    await page.waitForURL('**/instance_question/**');
    expect(page.url()).toContain('/instance_question/');
    await page.goto(instanceUrl);
  });
});

// ===================================================================
// 2. Homework (hw1-automaticTestSuite)
// ===================================================================

test('Homework: shows correct columns and variant badges', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  await setupStudent('e2e_sai_hw1@test.com', 'SAI HW1', 'SAIHW1', courseInstance);
  await goToHomeworkInstance(page, baseURL, courseInstance.id, 'hw1-automaticTestSuite', 'e2e_sai_hw1@test.com');

  await expect(page.getByTestId('assessment-questions')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Value' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Variant history' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Awarded points/ })).toBeVisible();

  // Variant badges appear after visiting questions (variants are created lazily).
  // Visit the first question to create a variant, then go back and check for the badge.
  const instanceUrl = page.url();
  const firstQuestionLink = page.getByTestId('assessment-questions').locator('a[href*="instance_question"]').first();
  await firstQuestionLink.click();
  await page.waitForURL('**/instance_question/**');
  await page.goto(instanceUrl);
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle');

  // Now we should see an "Open" badge for the visited question's variant
  const variantBadge = page.getByTestId('assessment-questions').locator('a').filter({ hasText: 'Open' });
  await expect(variantBadge.first()).toBeVisible();
});

// ===================================================================
// 3. Exam Footer + Finish Modal (exam17-mixedRealTimeGrading)
// ===================================================================

test.describe.serial('Exam footer and confirm finish modal', () => {
  const STUDENT = { uid: 'e2e_sai_footer@test.com', name: 'SAI Footer', uin: 'SAIFT' };

  test.beforeAll(async ({ courseInstance }) => {
    await setupStudent(STUDENT.uid, STUDENT.name, STUDENT.uin, courseInstance);
  });

  test('shows grade and finish buttons, modal works, can finish', async ({
    page,
    baseURL,
    courseInstance,
  }) => {
    await goToInstance(page, baseURL, courseInstance.id, 'exam17-mixedRealTimeGrading', STUDENT.uid);

    // Grade button disabled when no saved answers
    const gradeButton = page.getByRole('button', { name: 'No saved answers to grade' });
    await expect(gradeButton).toBeVisible();
    await expect(gradeButton).toBeDisabled();

    // Finish button visible
    const finishButton = page.getByRole('button', { name: 'Finish assessment' });
    await expect(finishButton).toBeVisible();
    await expect(finishButton).toBeEnabled();

    // Click finish → modal opens
    await finishButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('All done?')).toBeVisible();
    await expect(dialog.getByText('There are still unanswered questions.')).toBeVisible();

    // Cancel closes modal
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();

    // Wait for modal to fully close before reopening
    await page.waitForTimeout(500);

    // Reopen: scope to the footer button (not the modal's submit button)
    await page.locator('.card-footer').getByRole('button', { name: 'Finish assessment' }).click();
    await expect(dialog).toBeVisible();

    // Submit via the modal's button
    await dialog.getByRole('button', { name: 'Finish assessment' }).click();

    // After finish, assessment shows "closed"
    await page.waitForLoadState('load');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('closed', { exact: true })).toBeVisible();
  });
});

// ===================================================================
// 4. Lockpoints (exam18-lockpoints: zones 2 & 3 have lockpoints)
// ===================================================================

test.describe.serial('Lockpoints', () => {
  const STUDENT = { uid: 'e2e_sai_lock@test.com', name: 'SAI Lock', uin: 'SAILK' };

  test.beforeAll(async ({ courseInstance }) => {
    await setupStudent(STUDENT.uid, STUDENT.name, STUDENT.uin, courseInstance);
  });

  test('lockpoint states, modal interaction, and crossing', async ({
    page,
    baseURL,
    courseInstance,
  }) => {
    await goToInstance(page, baseURL, courseInstance.id, 'exam18-lockpoints', STUDENT.uid);

    // First lockpoint: crossable (yellow, "Proceed" button)
    const proceedButton = page.getByRole('button', { name: 'Proceed to next questions' });
    await expect(proceedButton).toBeVisible();

    // Second lockpoint: locked (gray)
    await expect(page.getByText('Complete previous questions to unlock.')).toBeVisible();

    // Open cross-lockpoint modal
    await proceedButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Proceed to next questions?')).toBeVisible();

    // Confirm button disabled until checkbox checked
    const confirmButton = dialog.getByRole('button', { name: 'Confirm' });
    await expect(confirmButton).toBeDisabled();

    // Check checkbox → confirm enabled
    await dialog.locator('#lockpoint-confirm').check();
    await expect(confirmButton).toBeEnabled();

    // Cancel → modal closes, lockpoint still crossable
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(proceedButton).toBeVisible();

    // Actually cross the lockpoint
    await proceedButton.click();
    await expect(dialog).toBeVisible();
    await dialog.locator('#lockpoint-confirm').check();
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    // Page reloads after form submission
    await page.waitForLoadState('load');
    await page.waitForLoadState('networkidle');

    // After crossing first lockpoint, second should now be crossable
    await expect(page.getByRole('button', { name: 'Proceed to next questions' })).toBeVisible();
  });
});

// ===================================================================
// 5. Real-Time Grading Disabled (exam8-disableRealTimeGrading)
// ===================================================================

test('Real-time grading disabled: warning, columns, and footer', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  await setupStudent('e2e_sai_nort@test.com', 'SAI NoRT', 'SAINRT', courseInstance);
  await goToInstance(
    page,
    baseURL,
    courseInstance.id,
    'exam8-disableRealTimeGrading',
    'e2e_sai_nort@test.com',
  );

  // Warning alert
  await expect(
    page.getByText('This assessment will only be graded after it is finished'),
  ).toBeVisible();

  // "Points" column (not "Available points" / "Awarded points")
  await expect(page.getByRole('columnheader', { name: 'Points', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Available points' })).not.toBeVisible();

  // Footer: finish button present, no grade button
  await expect(page.getByRole('button', { name: 'Finish assessment' })).toBeVisible();
  await expect(page.getByRole('button', { name: /saved answers to grade/ })).not.toBeVisible();
});

// ===================================================================
// 6. Mixed Real-Time Grading (exam17-mixedRealTimeGrading)
// ===================================================================

test('Mixed real-time grading: info alert and grade button', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  await setupStudent('e2e_sai_mix@test.com', 'SAI Mix', 'SAIMX', courseInstance);
  await goToInstance(
    page,
    baseURL,
    courseInstance.id,
    'exam17-mixedRealTimeGrading',
    'e2e_sai_mix@test.com',
  );

  await expect(
    page.getByText('Some questions in this assessment allow real-time grading'),
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: /saved answers to grade|No saved answers/ }),
  ).toBeVisible();
});

// ===================================================================
// 7. Group Work (exam14-groupWork: min 2, max 2 members, no roles)
// ===================================================================

test('Group work: shows group info and leave group modal', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  const student1 = await setupStudent(
    'e2e_sai_grp1@test.com',
    'SAI Group1',
    'SAIG1',
    courseInstance,
  );
  await setupStudent('e2e_sai_grp2@test.com', 'SAI Group2', 'SAIG2', courseInstance);

  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam14-groupWork',
  });

  await createGroup({
    course_instance: courseInstance,
    assessment,
    group_name: 'e2eGroupSAI',
    uids: ['e2e_sai_grp1@test.com', 'e2e_sai_grp2@test.com'],
    authn_user_id: student1.id,
    authzData: dangerousFullSystemAuthz(),
  });

  await goToInstance(page, baseURL, courseInstance.id, 'exam14-groupWork', 'e2e_sai_grp1@test.com');

  // Group info
  await expect(page.locator('#group-name')).toHaveText('e2eGroupSAI');
  await expect(page.locator('#join-code')).toBeVisible();

  // Scope to page content to avoid matching the nav dropdown
  const content = page.locator('#content');
  await expect(content.getByText('e2e_sai_grp1@test.com')).toBeVisible();
  await expect(content.getByText('e2e_sai_grp2@test.com')).toBeVisible();

  // Leave group button → modal
  await page.getByRole('button', { name: 'Leave the group' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Are you sure you want to leave the group?')).toBeVisible();

  // Dismiss with the text "Close" button (not the X button)
  await dialog.getByText('Close', { exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

// ===================================================================
// 8. Per-Zone Grading (exam5-perZoneGrading: maxPoints + bestQuestions)
// ===================================================================

test('Per-zone grading: maxPoints and bestQuestions popovers', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  await setupStudent('e2e_sai_zone@test.com', 'SAI Zone', 'SAIZN', courseInstance);
  await goToInstance(page, baseURL, courseInstance.id, 'exam5-perZoneGrading', 'e2e_sai_zone@test.com');

  // Zone 1: maxPoints
  const maxPointsButton = page.getByRole('button', { name: /maximum 5 points/ });
  await expect(maxPointsButton).toBeVisible();
  await maxPointsButton.click();
  await expect(page.getByText(/at most 5 will count toward your total points/)).toBeVisible();

  // Close by clicking heading
  await page.locator('h1').click();
  await expect(page.getByText(/at most 5 will count toward your total points/)).not.toBeVisible();

  // Zone 2: bestQuestions
  const bestQButton = page.getByRole('button', { name: /best 2 of 3 questions/ });
  await expect(bestQButton).toBeVisible();
  await bestQButton.click();
  await expect(
    page.getByText(/only the 2 with the highest number of awarded points/),
  ).toBeVisible();

  // Close
  await page.locator('h1').click();
  await expect(
    page.getByText(/only the 2 with the highest number of awarded points/),
  ).not.toBeVisible();
});

// ===================================================================
// 9. Time Limit (exam5-perZoneGrading: timeLimitMin 50)
// ===================================================================

test('Time limit: shows countdown elements', async ({ page, baseURL, courseInstance }) => {
  await setupStudent('e2e_sai_time@test.com', 'SAI Time', 'SAITM', courseInstance);
  await goToInstance(page, baseURL, courseInstance.id, 'exam5-perZoneGrading', 'e2e_sai_time@test.com');

  await expect(page.getByText('Time remaining:')).toBeVisible();
  await expect(page.locator('#countdownDisplay')).toBeAttached();
  await expect(page.locator('#countdownProgress')).toBeAttached();
});
