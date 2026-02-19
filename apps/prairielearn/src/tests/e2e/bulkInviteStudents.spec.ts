import type { Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { getCourseInstanceStudentsUrl } from '../../lib/client/url.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { ensureUncheckedEnrollment, inviteStudentByUid } from '../../models/enrollment.js';
import { syncCourse } from '../helperCourse.js';
import { type AuthUser, getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForJobAndCheckOutput } from './jobSequenceUtils.js';

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

let courseInstanceId: string;

/**
 * Creates test users and sets up the database for testing bulk invitations.
 */
async function createTestData() {
  const course = await selectCourseByShortName('QA 101');
  const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
  courseInstanceId = courseInstance.id;

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

async function openInviteModal(page: Page) {
  await page.getByRole('button', { name: 'Manage enrollments' }).click();
  await page.locator('.dropdown-menu').getByText('Invite students').click();
}

test.describe('Bulk invite students', () => {
  test.beforeAll(async ({ testCoursePath }) => {
    await syncCourse(testCoursePath);
    await createTestData();
  });

  test('can invite a single valid student', async ({ page }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));
    await expect(page).toHaveTitle(/Students/);

    // Open the invite modal from the dropdown
    await openInviteModal(page);

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
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await openInviteModal(page);
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

    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await openInviteModal(page);
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
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await openInviteModal(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'UIDs' }).fill('not-an-email');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    await expect(
      page.getByText('The following UIDs were invalid: "not-an-email"', { exact: true }),
    ).toBeVisible();
  });
});
