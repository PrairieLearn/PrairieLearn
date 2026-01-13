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

  test('can sync students with invites and blocks', async ({ page }) => {
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
    await expect(page).toHaveTitle(/Students/);

    // Click the sync button
    await page.getByRole('button', { name: 'Sync students' }).click();

    // Modal should open with expected content
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText('Sync students', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Student UIDs' })).toBeVisible();

    // Enter roster with fresh_sync_new but NOT fresh_sync_block
    await page.getByRole('textbox', { name: 'Student UIDs' }).fill('fresh_sync_new@test.com');

    await page.getByRole('button', { name: 'Compare' }).click();

    // Should show preview with correct students
    await expect(page.getByText('Review the changes below')).toBeVisible();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Students to invite')).toBeVisible();
    await expect(dialog.getByText('fresh_sync_new@test.com')).toBeVisible();
    await expect(dialog.getByText('Students to block')).toBeVisible();
    await expect(dialog.getByText('fresh_sync_block@test.com')).toBeVisible();

    // Click sync button
    await page.getByRole('button', { name: /Sync \d+ student/ }).click();

    // Check job output
    await waitForJobAndCheckOutput(page, [
      'fresh_sync_new@test.com: Invited',
      'fresh_sync_block@test.com: Blocked',
    ]);
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
});
