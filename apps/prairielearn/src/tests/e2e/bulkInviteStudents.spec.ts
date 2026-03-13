import type { Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { getCourseInstanceStudentsUrl } from '../../lib/client/url.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { type AuthUser, getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForJobAndCheckOutput } from './jobSequenceUtils.js';

async function openInviteModal(page: Page) {
  await page.getByRole('button', { name: 'Manage enrollments' }).click();
  await page.locator('.dropdown-menu').getByText('Invite students').click();
}

test.describe('Bulk invite students', () => {
  test('can invite a single valid student', async ({ page, courseInstance }) => {
    const student: AuthUser = { uid: 'bulk_single@test.com', uin: null, name: 'Bulk Single' };
    await getOrCreateUser(student);

    await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));
    await expect(page).toHaveTitle(/Students/);

    await openInviteModal(page);

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText('Invite students', { exact: true }),
    ).toBeVisible();

    await page.getByRole('textbox', { name: 'UIDs' }).fill(student.uid);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    await waitForJobAndCheckOutput(page, [`${student.uid}: Invited`, 'Successfully invited: 1']);
  });

  test('can invite multiple valid students', async ({ page, courseInstance }) => {
    const student2: AuthUser = {
      uid: 'bulk_multi_2@test.com',
      uin: null,
      name: 'Bulk Multi 2',
    };
    const student3: AuthUser = {
      uid: 'bulk_multi_3@test.com',
      uin: null,
      name: 'Bulk Multi 3',
    };
    await getOrCreateUser(student2);
    await getOrCreateUser(student3);

    await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));

    await openInviteModal(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'UIDs' }).fill(`${student2.uid}\n${student3.uid}`);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    await waitForJobAndCheckOutput(page, [
      `${student2.uid}: Invited`,
      `${student3.uid}: Invited`,
      'Successfully invited: 2',
    ]);
  });

  test('invites valid students and shows skip info for invalid ones', async ({
    page,
    courseInstance,
  }) => {
    const freshStudent: AuthUser = {
      uid: 'bulk_fresh@test.com',
      uin: null,
      name: 'Bulk Fresh',
    };
    const enrolledStudent: AuthUser = {
      uid: 'bulk_enrolled@test.com',
      uin: null,
      name: 'Bulk Enrolled',
    };

    await getOrCreateUser(freshStudent);
    const enrolledUser = await getOrCreateUser(enrolledStudent);

    await ensureUncheckedEnrollment({
      userId: enrolledUser.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));

    await openInviteModal(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page
      .getByRole('textbox', { name: 'UIDs' })
      .fill(`${freshStudent.uid}\n${enrolledStudent.uid}`);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    await waitForJobAndCheckOutput(page, [
      `${freshStudent.uid}: Invited`,
      `${enrolledStudent.uid}: Skipped (already enrolled)`,
      'Successfully invited: 1',
      'Skipped (already enrolled): 1',
    ]);
  });

  test('shows error for invalid email format', async ({ page, courseInstance }) => {
    await page.goto(getCourseInstanceStudentsUrl(courseInstance.id));

    await openInviteModal(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'UIDs' }).fill('not-an-email');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    await expect(
      page.getByText('The following UIDs were invalid: "not-an-email"', { exact: true }),
    ).toBeVisible();
  });
});
