import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { getCourseInstanceStudentsUrl } from '../../lib/client/url.js';
import {
  ensureUncheckedEnrollment,
  inviteStudentByUid,
  setEnrollmentStatus,
} from '../../models/enrollment.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForJobAndCheckOutput } from './jobSequenceUtils.js';

test.describe('Sync students', () => {
  test('allows deselecting previewed students before syncing', async ({ page, courseInstance }) => {
    const inviteOnlyUid = 'sync_toggle_invite@test.com';
    await getOrCreateUser({ uid: inviteOnlyUid, name: 'Toggle Invite', uin: null });

    await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));
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

  test('can sync students with invites, cancellations, and removals', async ({
    page,
    courseInstance,
  }) => {
    // Create a new student to invite
    await getOrCreateUser({ uid: 'sync_add@test.com', name: 'Sync Add', uin: null });

    // Create an enrolled student to remove
    const toRemove = await getOrCreateUser({
      uid: 'sync_remove@test.com',
      name: 'Sync Remove',
      uin: null,
    });
    await ensureUncheckedEnrollment({
      userId: toRemove.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    // Create a pending invitation to cancel
    await inviteStudentByUid({
      uid: 'sync_cancel@test.com',
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
    });

    await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));
    await expect(page).toHaveTitle(/Students/);

    await page.getByRole('button', { name: 'Manage enrollments' }).click();
    await page.getByRole('button', { name: 'Synchronize student list' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText('Synchronize student list', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Student UIDs' })).toBeVisible();

    // Sync with only sync_add — sync_remove and sync_cancel should be removed/cancelled
    await page.getByRole('textbox', { name: 'Student UIDs' }).fill('sync_add@test.com');

    await page.getByRole('button', { name: 'Compare' }).click();

    await expect(page.getByText('Review the changes below')).toBeVisible();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Students to add')).toBeVisible();
    await expect(dialog.getByText('sync_add@test.com')).toBeVisible();
    await expect(dialog.getByText('Students to remove')).toBeVisible();
    await expect(dialog.getByText('sync_cancel@test.com')).toBeVisible();
    await expect(dialog.getByText('sync_remove@test.com')).toBeVisible();

    await page.getByRole('button', { name: /Update \d+ student/ }).click();

    await waitForJobAndCheckOutput(page, [
      'sync_add@test.com: Invited',
      'sync_cancel@test.com: Invitation cancelled',
      'sync_remove@test.com: Removed',
    ]);
  });

  test('re-invites blocked and removed students who reappear on the student list', async ({
    page,
    courseInstance,
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

    await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));
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

  test('shows validation error for invalid email format', async ({ page, courseInstance }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));

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
