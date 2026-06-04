import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { getCourseInstanceStudentsUrl } from '../../lib/client/url.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import {
  ensureUncheckedEnrollment,
  inviteStudentByUid,
  setEnrollmentStatus,
} from '../../models/enrollment.js';
import { syncCourse } from '../helperCourse.js';
import { type AuthUser, getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForJobAndCheckOutput } from './jobSequenceUtils.js';

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
const STUDENT_TO_REMOVE: AuthUser = {
  uid: 'sync_to_remove@test.com',
  uin: null,
  name: 'Student To Remove',
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

  // Create a student who will be removed (currently enrolled)
  const studentToRemoveUser = await getOrCreateUser(STUDENT_TO_REMOVE);

  await ensureUncheckedEnrollment({
    userId: studentToRemoveUser.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });
}

test.describe('Sync students', () => {
  test.beforeAll(async ({ testCoursePath }) => {
    await syncCourse(testCoursePath);
    await createTestData();
  });

  test('allows deselecting previewed students before syncing', async ({ page }) => {
    const inviteOnlyUid = 'sync_toggle_invite@test.com';
    await getOrCreateUser({ uid: inviteOnlyUid, name: 'Toggle Invite', uin: null });

    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));
    await expect(page).toHaveTitle(/Students/);

    await page.getByRole('button', { name: 'Manage enrollments' }).click();
    await page.getByRole('button', { name: 'Synchronize student list' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'Student UIDs' }).fill(inviteOnlyUid);
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(page.getByText('Review the changes below')).toBeVisible();

    const dialog = page.getByRole('dialog');
    const syncButton = dialog.getByRole('button', { name: /Update \d+ student/ });
    const initialCount = Number((await syncButton.innerText()).match(/Update (\d+) student/)![1]);

    const inviteCheckbox = dialog.locator(`[id="sync-add-${inviteOnlyUid}"]`);
    await expect(inviteCheckbox).toBeChecked();
    await inviteCheckbox.click();
    await expect(inviteCheckbox).not.toBeChecked();

    const updatedCount = Number((await syncButton.innerText()).match(/Update (\d+) student/)![1]);
    expect(updatedCount).toBe(initialCount - 1);
  });

  test('can sync students with invites, cancellations, and removals', async ({ page }) => {
    // Create fresh users for this test to avoid conflicts
    await getOrCreateUser({ uid: 'fresh_sync_new@test.com', name: 'Fresh New', uin: null });
    const freshToRemove = await getOrCreateUser({
      uid: 'fresh_sync_remove@test.com',
      name: 'Fresh Remove',
      uin: null,
    });

    const course = await selectCourseByShortName('QA 101');
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });

    // Enroll a student who will be removed
    await ensureUncheckedEnrollment({
      userId: freshToRemove.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    // Create a pending invitation that will be cancelled
    await inviteStudentByUid({
      uid: 'fresh_sync_cancel@test.com',
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
    });

    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));
    await expect(page).toHaveTitle(/Students/);

    // Open the manage enrollments dropdown and click synchronize student list
    await page.getByRole('button', { name: 'Manage enrollments' }).click();
    await page.getByRole('button', { name: 'Synchronize student list' }).click();

    // Modal should open with expected content
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText('Synchronize student list', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Student UIDs' })).toBeVisible();

    // Enter student list with fresh_sync_new but NOT fresh_sync_remove or fresh_sync_cancel
    await page.getByRole('textbox', { name: 'Student UIDs' }).fill('fresh_sync_new@test.com');

    await page.getByRole('button', { name: 'Compare' }).click();

    // Should show preview with correct students in each category
    await expect(page.getByText('Review the changes below')).toBeVisible();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Students to add')).toBeVisible();
    await expect(dialog.getByText('fresh_sync_new@test.com')).toBeVisible();
    await expect(dialog.getByText('Students to remove')).toBeVisible();
    await expect(dialog.getByText('fresh_sync_cancel@test.com')).toBeVisible();
    await expect(dialog.getByText('fresh_sync_remove@test.com')).toBeVisible();

    // Click sync button
    await page.getByRole('button', { name: /Update \d+ student/ }).click();

    // Check job output
    await waitForJobAndCheckOutput(page, [
      'fresh_sync_new@test.com: Invited',
      'fresh_sync_cancel@test.com: Invitation cancelled',
      'fresh_sync_remove@test.com: Removed',
    ]);
  });

  test('re-invites blocked and removed students who reappear on the student list', async ({
    page,
  }) => {
    const blockedUser = await getOrCreateUser({
      uid: 'sync_blocked@test.com',
      name: 'Blocked Student',
      uin: null,
    });
    const removedUser = await getOrCreateUser({
      uid: 'sync_removed@test.com',
      name: 'Removed Student',
      uin: null,
    });

    const course = await selectCourseByShortName('QA 101');
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });

    const blockedEnrollment = await ensureUncheckedEnrollment({
      userId: blockedUser.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });
    const removedEnrollment = await ensureUncheckedEnrollment({
      userId: removedUser.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    if (!blockedEnrollment || !removedEnrollment) {
      throw new Error('Expected enrollments to exist for blocked/removed users');
    }

    await setEnrollmentStatus({
      enrollment: blockedEnrollment,
      status: 'blocked',
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
    });
    await setEnrollmentStatus({
      enrollment: removedEnrollment,
      status: 'removed',
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
    });

    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));
    await expect(page).toHaveTitle(/Students/);

    await page.getByRole('button', { name: 'Manage enrollments' }).click();
    await page.getByRole('button', { name: 'Synchronize student list' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Student UIDs' })
      .fill('sync_blocked@test.com\nsync_removed@test.com');

    await page.getByRole('button', { name: 'Compare' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Students to add')).toBeVisible();
    await expect(dialog.getByText('sync_blocked@test.com')).toBeVisible();
    await expect(dialog.getByText('sync_removed@test.com')).toBeVisible();

    await page.getByRole('button', { name: /Update \d+ student/ }).click();

    await waitForJobAndCheckOutput(page, [
      'sync_blocked@test.com: Unblocked',
      'sync_removed@test.com: Reenrolled',
    ]);
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstanceId));

    await page.getByRole('button', { name: 'Manage enrollments' }).click();
    await page.getByRole('button', { name: 'Synchronize student list' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'Student UIDs' }).fill('not-an-email');

    await page.getByRole('button', { name: 'Compare' }).click();

    await expect(
      page.getByText('The following UIDs were invalid: "not-an-email"', { exact: true }),
    ).toBeVisible();
  });
});
