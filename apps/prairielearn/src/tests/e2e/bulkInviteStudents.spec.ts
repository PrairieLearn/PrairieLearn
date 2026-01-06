import type { Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { features } from '../../lib/features/index.js';
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

// Test users for various scenarios
const VALID_STUDENT: AuthUser = { uid: 'valid_student@test.com', uin: null, name: 'Valid Student' };
const VALID_STUDENT_2: AuthUser = {
  uid: 'valid_student2@test.com',
  uin: null,
  name: 'Valid Student 2',
};
const VALID_STUDENT_3: AuthUser = {
  uid: 'valid_student3@test.com',
  uin: null,
  name: 'Valid Student 3',
};
const ENROLLED_STUDENT: AuthUser = {
  uid: 'enrolled_student@test.com',
  uin: null,
  name: 'Enrolled Student',
};
const INVITED_STUDENT: AuthUser = {
  uid: 'invited_student@test.com',
  uin: null,
  name: 'Invited Student',
};

let studentsPageUrl: string;

/**
 * Creates test users and sets up the database for testing bulk invitations.
 */
async function createTestData() {
  const course = await selectCourseByShortName('QA 101');
  const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
  studentsPageUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students`;

  // Enable the enrollment-management feature flag
  await features.enable('enrollment-management', { institution_id: '1' });

  // Create valid students (not enrolled)
  for (const student of [VALID_STUDENT, VALID_STUDENT_2, VALID_STUDENT_3]) {
    await getOrCreateUser(student);
  }

  // Create an already enrolled student
  const enrolledUser = await getOrCreateUser({
    uid: ENROLLED_STUDENT.uid,
    name: ENROLLED_STUDENT.name,
    uin: null,
  });

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
}

test.describe('Bulk invite students', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();
    await createTestData();
  });

  test('can invite a single valid student', async ({ page }) => {
    await page.goto(studentsPageUrl);
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
    await page.goto(studentsPageUrl);

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

    await page.goto(studentsPageUrl);

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
      'Skipped (already enrolled): 1',
    ]);
  });

  test('shows error for invalid email format', async ({ page }) => {
    await page.goto(studentsPageUrl);

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'UIDs' }).fill('not-an-email');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    await expect(
      page.getByText('The following UIDs were invalid: "not-an-email"', { exact: true }),
    ).toBeVisible();
  });
});
