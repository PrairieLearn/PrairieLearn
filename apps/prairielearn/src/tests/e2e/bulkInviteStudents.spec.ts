import type { Page } from '@playwright/test';

import * as sqldb from '@prairielearn/postgres';

import { features } from '../../lib/features/index.js';
import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { syncCourse } from '../helperCourse.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

/**
 * Waits for the job sequence page to show completion and checks for expected text in the job output.
 */
async function waitForJobAndCheckOutput(page: Page, expectedTexts: string[]) {
  // Should be redirected to the job sequence page
  await expect(page).toHaveURL(/\/jobSequence\//, { timeout: 10000 });

  // Wait for job to complete (status badge shows Success)
  await expect(page.getByText('Success', { exact: true })).toBeVisible({ timeout: 30000 });

  // Check for expected text in the job output
  for (const text of expectedTexts) {
    await expect(page.getByText(text)).toBeVisible();
  }
}

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface TestUser {
  uid: string;
  name: string;
}

// Test users for various scenarios
const VALID_STUDENT: TestUser = { uid: 'valid_student@test.com', name: 'Valid Student' };
const VALID_STUDENT_2: TestUser = { uid: 'valid_student2@test.com', name: 'Valid Student 2' };
const VALID_STUDENT_3: TestUser = { uid: 'valid_student3@test.com', name: 'Valid Student 3' };
const ENROLLED_STUDENT: TestUser = { uid: 'enrolled_student@test.com', name: 'Enrolled Student' };
const INVITED_STUDENT: TestUser = { uid: 'invited_student@test.com', name: 'Invited Student' };

/**
 * Creates test users and sets up the database for testing bulk invitations.
 */
async function createTestData() {
  // Enable modern publishing for the course instance
  await sqldb.execute(sql.enable_modern_publishing, {});

  // Enable the enrollment-management feature flag
  await features.enable('enrollment-management', { institution_id: '1' });

  // Create valid students (not enrolled)
  for (const student of [VALID_STUDENT, VALID_STUDENT_2, VALID_STUDENT_3]) {
    await getOrCreateUser({ uid: student.uid, name: student.name, uin: null });
  }

  // Create an already enrolled student
  const enrolledUser = await getOrCreateUser({
    uid: ENROLLED_STUDENT.uid,
    name: ENROLLED_STUDENT.name,
    uin: null,
  });
  await sqldb.execute(sql.insert_joined_enrollment, { user_id: enrolledUser.user_id });

  // Create a student with a pending invitation (uses pending_uid)
  await sqldb.execute(sql.insert_invited_enrollment, { pending_uid: INVITED_STUDENT.uid });
}

test.describe('Bulk invite students', () => {
  test.beforeAll(async () => {
    await syncCourse(EXAMPLE_COURSE_PATH);
    await createTestData();
  });

  test('can invite a single valid student', async ({ page }) => {
    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');
    await expect(page).toHaveTitle(/Students/);

    // Click the invite button
    await page.getByRole('button', { name: 'Invite students' }).click();

    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText('Invite students', { exact: true }),
    ).toBeVisible();

    // Enter a single valid UID
    await page.getByRole('textbox', { name: 'UIDs' }).fill(VALID_STUDENT.uid);

    // Click invite
    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    // Check job output shows successful invite
    await waitForJobAndCheckOutput(page, [
      `${VALID_STUDENT.uid}: Invited`,
      'Successfully invited: 1',
    ]);
  });

  test('can invite multiple valid students', async ({ page }) => {
    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter multiple UIDs
    await page
      .getByRole('textbox', { name: 'UIDs' })
      .fill(`${VALID_STUDENT_2.uid}\n${VALID_STUDENT_3.uid}`);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    // Check job output shows successful invites
    await waitForJobAndCheckOutput(page, [
      `${VALID_STUDENT_2.uid}: Invited`,
      `${VALID_STUDENT_3.uid}: Invited`,
      'Successfully invited: 2',
    ]);
  });

  test('invites valid students and shows skip info for invalid ones', async ({ page }) => {
    // Create a fresh valid student for this test
    await getOrCreateUser({ uid: 'fresh_student@test.com', name: 'Fresh Student', uin: null });

    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter mix of valid and already enrolled UIDs
    await page
      .getByRole('textbox', { name: 'UIDs' })
      .fill(`fresh_student@test.com\n${ENROLLED_STUDENT.uid}`);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    // Check job output shows successful invite and skip info
    await waitForJobAndCheckOutput(page, [
      'fresh_student@test.com: Invited',
      `${ENROLLED_STUDENT.uid}: Skipped (already enrolled)`,
      'Successfully invited: 1',
      'Already enrolled (skipped): 1',
    ]);
  });

  test('shows error for invalid email format', async ({ page }) => {
    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'UIDs' }).fill('not-an-email');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    await expect(page.getByText('invalid', { exact: false })).toBeVisible({ timeout: 10000 });
  });
});
