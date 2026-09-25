import { ensureInstitutionAdministrator } from '../../ee/models/institution-administrator.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { selectCourseById } from '../../models/course.js';
import { insertInstitution } from '../../models/institution.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const STAFF_USER = { uid: 'staff-user@other.example.edu', name: 'Staff user', uin: 'staff-user' };
const test = createTest({
  authUid: STAFF_USER.uid,
  authName: STAFF_USER.name,
  authUin: STAFF_USER.uin,
  authEmail: STAFF_USER.uid,
});

test('Staff controls allow institution admins to edit themselves and remove Owners', async ({
  page,
  courseInstance,
}) => {
  const course = await selectCourseById(courseInstance.course_id);
  // The admin's home institution differs from the course's institution.
  await insertInstitution({
    shortName: 'Other',
    longName: 'Other institution',
    displayTimezone: 'UTC',
    uidRegexp: '@other\\.example\\.edu$',
  });
  const user = await getOrCreateUser(STAFF_USER);
  const ownerUid = 'other-owner@example.com';
  for (const uid of [user.uid, ownerUid]) {
    await insertCoursePermissionsByUserUid({
      course_id: course.id,
      uid,
      course_role: 'Owner',
      authn_user_id: '1',
    });
  }
  await page.goto(`/pl/course/${course.id}/course_admin/staff`);
  const ownRow = page.getByRole('row').filter({ hasText: user.uid });
  const ownCheckbox = page.getByRole('checkbox', { name: `Select ${user.uid}`, exact: true });
  const ownerCheckbox = page.getByRole('checkbox', { name: `Select ${ownerUid}`, exact: true });
  const editButton = page.getByRole('button', { name: 'Edit access', exact: true });
  const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });

  await expect(ownRow.getByRole('button', { name: 'Owner', exact: true })).toHaveCount(0);
  await ownCheckbox.check();
  await expect(editButton).toBeDisabled();
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
  await deleteButton.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove 2 users' }).click();
  await expect(ownCheckbox).toHaveCount(0);
  await expect(ownerCheckbox).toHaveCount(0);
});
