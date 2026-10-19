import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { getCourseInstanceStudentsUrl } from '../../lib/client/url.js';
import {
  ensureUncheckedEnrollment,
  inviteStudentByUid,
  setEnrollmentStatus,
} from '../../models/enrollment.js';
import {
  addLabelToEnrollment,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForJobAndCheckOutput } from './utils/job-sequence.js';

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

test('synchronizes students from a CSV file on mobile', async ({ page, courseInstance }) => {
  const existingUid = 'csv-file-existing@example.com';
  const newUid = 'csv-file-new@example.com';
  const authzData = dangerousFullSystemAuthz();
  const enrollment = await inviteStudentByUid({
    uid: existingUid,
    courseInstance,
    authzData,
    requiredRole: ['System'],
  });
  await inviteStudentByUid({
    uid: 'csv-file-keep@example.com',
    courseInstance,
    authzData,
    requiredRole: ['System'],
  });
  const labels = await selectStudentLabelsInCourseInstance(courseInstance);
  const section = labels.find((label) => label.name === 'Section A');
  expect(section).toBeDefined();
  await addLabelToEnrollment({ enrollment, label: section!, authzData });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));
  await page.getByRole('button', { name: 'Manage enrollments' }).click();
  await page.getByRole('button', { name: 'Synchronize student list' }).click();

  const format = page.getByRole('group', { name: 'Input format' });
  await page.getByRole('radio', { name: 'CSV file', exact: true }).check();
  const input = page.getByLabel('Choose CSV file', { exact: true });
  const compare = page.getByRole('button', { name: 'Compare', exact: true });
  await compare.click();
  await expect(page.getByText('Select a CSV file.', { exact: true })).toBeVisible();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.setInputFiles({
    name: 'students.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`uid,labels\n${existingUid},Unknown`),
  });
  await compare.click();
  await expect(page.getByRole('alert').filter({ hasText: 'unknown label' })).toBeVisible();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const csvText = `uid,labels\n${existingUid},Extra time\n${newUid},Section A;Extra time`;
  await input.setInputFiles({
    name: 'students.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvText),
  });
  await compare.click();
  const changes = page.getByRole('group', { name: 'Students with label changes' });
  await expect(changes.getByText('Remove: Section A')).toBeVisible();
  await expect(changes.getByText('Add: Extra time')).toBeVisible();

  // Switching formats must discard the previously selected file.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await format.getByRole('radio', { name: 'UID list', exact: true }).check();
  await page.getByRole('textbox', { name: 'Student UIDs' }).fill('pasted-student@example.com');
  await compare.click();
  await expect(
    page.getByRole('group', { name: 'Students to add' }).getByText('pasted-student@example.com'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await format.getByRole('radio', { name: 'CSV file', exact: true }).check();
  await compare.click();
  await expect(page.getByText('Select a CSV file.', { exact: true })).toBeVisible();

  await input.setInputFiles({
    name: 'students.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvText),
  });
  await compare.click();
  await page.getByRole('button', { name: 'Clear all students to remove' }).click();
  await page.getByRole('button', { name: 'Update 2 students', exact: true }).click();
  await waitForJobAndCheckOutput(page, [`${existingUid}: Labels updated`, `${newUid}: Invited`]);

  await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));
  const existing = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: existingUid, exact: true }) });
  await expect(existing.getByText('Extra time', { exact: true })).toBeVisible();
  await expect(existing.getByText('Section A', { exact: true })).not.toBeVisible();
  await expect(existing.getByText('Invited', { exact: true })).toBeVisible();
  const added = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: newUid, exact: true }) });
  await expect(added.getByText('Section A', { exact: true })).toBeVisible();
  await expect(added.getByText('Extra time', { exact: true })).toBeVisible();
});
