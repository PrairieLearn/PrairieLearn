import { ensureInstitutionAdministrator } from '../../ee/models/institution-administrator.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { selectCourseById } from '../../models/course.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const STAFF_USER = { uid: 'staff-user@example.com', name: 'Staff user', uin: 'staff-user' };
const test = createTest({
  authUid: STAFF_USER.uid,
  authName: STAFF_USER.name,
  authUin: STAFF_USER.uin,
  authEmail: STAFF_USER.uid,
});

test('Staff controls allow institution admins to edit themselves and remove Owners', async ({
  page,
  courseInstance,
}, testInfo) => {
  const course = await selectCourseById(courseInstance.course_id);
  const user = await getOrCreateUser(STAFF_USER);
  const owner = await getOrCreateUser({
    uid: 'other-owner@example.com',
    name: 'Other owner',
    uin: null,
  });
  for (const staff of [user, owner]) {
    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid: staff.uid,
      course_role: 'Owner',
      authn_user_id: '1',
    });
  }
  await page.goto(`/pl/course/${course.id}/course_admin/staff`);
  const ownRow = page.getByRole('row').filter({ hasText: user.uid });
  const ownCheckbox = page.getByRole('checkbox', { name: `Select ${user.uid}`, exact: true });
  const ownerCheckbox = page.getByRole('checkbox', { name: `Select ${owner.uid}`, exact: true });
  const editButton = page.getByRole('button', { name: 'Edit access', exact: true });
  const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });

  await expect(ownRow.getByRole('button', { name: 'Owner', exact: true })).toHaveCount(0);
  await ownCheckbox.check();
  await expect(editButton).toBeDisabled();
  await expect(deleteButton).toBeDisabled();
  await ownerCheckbox.check();
  await expect(editButton).toBeEnabled();
  await expect(deleteButton).toBeDisabled();

  await ensureInstitutionAdministrator({
    institution_id: course.institution_id,
    user_id: user.id,
    authn_user_id: '1',
  });
  await page.reload();
  await ownRow.getByRole('button', { name: 'Owner', exact: true }).click();
  await page.getByRole('radio', { name: 'Viewer', exact: true }).check();
  await page.getByRole('button', { name: 'Change access', exact: true }).click();
  await expect(ownRow.getByRole('button', { name: 'Viewer', exact: true })).toBeVisible();

  await ownCheckbox.check();
  await ownerCheckbox.check();
  await editButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Edit access for 2 users')).toBeVisible();
  await dialog.getByLabel('Course content access').selectOption('Owner');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(ownRow.getByRole('button', { name: 'Owner', exact: true })).toBeVisible();

  await deleteButton.click();
  await expect(dialog.getByRole('button', { name: 'Remove 2 users' })).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath('institution-admin-remove-owners.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Remove 2 users' }).click();
  await expect(ownCheckbox).toHaveCount(0);
  await expect(ownerCheckbox).toHaveCount(0);
});
