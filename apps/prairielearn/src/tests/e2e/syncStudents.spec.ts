import type { Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { getCourseInstanceStudentsUrl } from '../../lib/client/url.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { ensureUncheckedEnrollment, inviteStudentByUid } from '../../models/enrollment.js';
import { type AuthUser, getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

/**
 * Waits for the job sequence page to show completion and checks for expected text in the job output.
 */
async function waitForJobAndCheckOutput(page: Page, expectedTexts: string[]) {
  // Should be redirected to the job sequence page
  await expect(page).toHaveURL(/\/jobSequence\//);

  // Wait for job to complete (status badge shows Success)
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();

  // Check for expected text in the job output (rendered in a <pre> element)
  const jobOutput = page.locator('pre');
  for (const text of expectedTexts) {
    await expect(jobOutput.getByText(text)).toBeVisible();
  }
}

// Test users for sync scenarios
const NEW_STUDENT: AuthUser = { uid: 'sync_new@test.com', uin: null, name: 'New Student' };
const ENROLLED_STUDENT: AuthUser = {
  uid: 'sync_enrolled@test.com',
  uin: null,
  name: 'Enrolled Student',
};
const INVITED_STUDENT: AuthUser = {
  uid: 'sync_invited@test.com',
  uin: null,
  name: 'Invited Student',
};
const STUDENT_TO_BLOCK: AuthUser = {
  uid: 'sync_to_block@test.com',
  uin: null,
  name: 'Student To Block',
};

let courseInstanceId: string;

/**
 * Creates test users and sets up the database for testing sync students.
 */
async function createTestData() {
  const course = await selectCourseByShortName('QA 101');
  const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
  courseInstanceId = courseInstance.id;

  // Create a new student (not enrolled)
  await getOrCreateUser(NEW_STUDENT);

  // Create an already enrolled student
  const enrolledUser = await getOrCreateUser(ENROLLED_STUDENT);

  await ensureUncheckedEnrollment({
    userId: enrolledUser.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });

  // Create a student with a pending invitation
  await inviteStudentByUid({
    uid: INVITED_STUDENT.uid,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
  });

  // Create a student who will be blocked (currently enrolled)
  const studentToBlockUser = await getOrCreateUser(STUDENT_TO_BLOCK);

  await ensureUncheckedEnrollment({
    userId: studentToBlockUser.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });
}

test.describe('Sync students', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();
    await createTestData();
  });

  test('can open sync students modal', async ({ page }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));
    await expect(page).toHaveTitle(/Students/);

    // Click the sync button
    await page.getByRole('button', { name: 'Sync students' }).click();

    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText('Sync students', { exact: true }),
    ).toBeVisible();

    // Check for expected modal content
    await expect(
      page.getByText('Paste your student roster below', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Student UIDs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compare' })).toBeVisible();
  });

  test('shows preview with students to invite and block', async ({ page }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await page.getByRole('button', { name: 'Sync students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter a roster that:
    // - Includes NEW_STUDENT (should be invited)
    // - Includes ENROLLED_STUDENT (already enrolled, no action)
    // - Does NOT include STUDENT_TO_BLOCK (should be blocked)
    await page
      .getByRole('textbox', { name: 'Student UIDs' })
      .fill(`${NEW_STUDENT.uid}\n${ENROLLED_STUDENT.uid}\n${INVITED_STUDENT.uid}`);

    await page.getByRole('button', { name: 'Compare' }).click();

    // Should show preview step
    await expect(page.getByText('Review the changes below')).toBeVisible();

    const dialog = page.getByRole('dialog');

    // Should show students to invite section with NEW_STUDENT
    await expect(dialog.getByText('Students to invite')).toBeVisible();
    await expect(dialog.getByText(NEW_STUDENT.uid)).toBeVisible();

    // Should show students to block section with STUDENT_TO_BLOCK
    await expect(dialog.getByText('Students to block')).toBeVisible();
    await expect(dialog.getByText(STUDENT_TO_BLOCK.uid)).toBeVisible();

    // Should show sync button with correct count
    await expect(page.getByRole('button', { name: /Sync \d+ student/ })).toBeVisible();
  });

  test('can execute sync with invites and blocks', async ({ page }) => {
    // Create fresh users for this test to avoid conflicts
    await getOrCreateUser({ uid: 'fresh_sync_new@test.com', name: 'Fresh New', uin: null });
    const freshToBlock = await getOrCreateUser({
      uid: 'fresh_sync_block@test.com',
      name: 'Fresh Block',
      uin: null,
    });

    const course = await selectCourseByShortName('QA 101');
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });

    await ensureUncheckedEnrollment({
      userId: freshToBlock.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await page.getByRole('button', { name: 'Sync students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter roster with fresh_sync_new but NOT fresh_sync_block
    await page.getByRole('textbox', { name: 'Student UIDs' }).fill('fresh_sync_new@test.com');

    await page.getByRole('button', { name: 'Compare' }).click();

    // Wait for preview
    await expect(page.getByText('Review the changes below')).toBeVisible();

    // Click sync button
    await page.getByRole('button', { name: /Sync \d+ student/ }).click();

    // Check job output
    await waitForJobAndCheckOutput(page, [
      'fresh_sync_new@test.com: Invited',
      'fresh_sync_block@test.com: Blocked',
    ]);
  });

  test('can deselect students before syncing', async ({ page }) => {
    // Create fresh users for this test
    await getOrCreateUser({ uid: 'deselect_new@test.com', name: 'Deselect New', uin: null });
    const deselectBlock = await getOrCreateUser({
      uid: 'deselect_block@test.com',
      name: 'Deselect Block',
      uin: null,
    });

    const course = await selectCourseByShortName('QA 101');
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });

    await ensureUncheckedEnrollment({
      userId: deselectBlock.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await page.getByRole('button', { name: 'Sync students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter roster that will add deselect_new and remove deselect_block
    await page.getByRole('textbox', { name: 'Student UIDs' }).fill('deselect_new@test.com');

    await page.getByRole('button', { name: 'Compare' }).click();

    // Wait for preview
    await expect(page.getByText('Review the changes below')).toBeVisible();

    // Uncheck the student to block by clicking the checkbox
    const blockCheckbox = page.getByRole('checkbox', { name: /deselect_block@test\.com/ });
    await blockCheckbox.uncheck();

    // Click sync button - should only sync the invite
    await page.getByRole('button', { name: /Sync \d+ student/ }).click();

    // Check job output - should only have the invite, not the block
    await waitForJobAndCheckOutput(page, ['deselect_new@test.com: Invited', 'Invited: 1']);

    // The blocked student should NOT appear in output
    const jobOutput = page.locator('pre');
    await expect(jobOutput.getByText('deselect_block@test.com: Blocked')).not.toBeVisible();
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await page.getByRole('button', { name: 'Sync students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'Student UIDs' }).fill('not-an-email');

    await page.getByRole('button', { name: 'Compare' }).click();

    await expect(
      page.getByText('The following UIDs were invalid: "not-an-email"', { exact: true }),
    ).toBeVisible();
  });

  test('shows "already in sync" message when no changes needed', async ({ page }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await page.getByRole('button', { name: 'Sync students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter roster with only currently enrolled/invited students
    await page
      .getByRole('textbox', { name: 'Student UIDs' })
      .fill(`${ENROLLED_STUDENT.uid}\n${INVITED_STUDENT.uid}\n${STUDENT_TO_BLOCK.uid}`);

    await page.getByRole('button', { name: 'Compare' }).click();

    // Should show "already in sync" message
    await expect(page.getByText('Your roster is already in sync')).toBeVisible();
  });

  test('can go back from preview to edit roster', async ({ page }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await page.getByRole('button', { name: 'Sync students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter some UIDs
    await page.getByRole('textbox', { name: 'Student UIDs' }).fill(NEW_STUDENT.uid);

    await page.getByRole('button', { name: 'Compare' }).click();

    // Should be in preview step
    await expect(page.getByText('Review the changes below')).toBeVisible();

    // Click back
    await page.getByRole('button', { name: 'Back' }).click();

    // Should be back to input step with the UIDs preserved
    await expect(page.getByRole('textbox', { name: 'Student UIDs' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Student UIDs' })).toHaveValue(NEW_STUDENT.uid);
  });
});
