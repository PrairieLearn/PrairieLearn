import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  deleteInstitutionAdministrator,
  ensureInstitutionAdministrator,
} from '../../ee/models/institution-administrator.js';
import {
  insertCoursePermissionsByUserUid,
  selectCoursePermissionForUser,
  updateCoursePermissionsRole,
  upsertCourseInstancePermissionsRole,
} from '../../models/course-permissions.js';
import { selectCourseById } from '../../models/course.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const STAFF_USER = { uid: 'staff-user@example.com', name: 'Staff user', uin: 'staff-user' };
const sql = loadSqlEquiv(import.meta.url);
const test = createTest({
  authUid: STAFF_USER.uid,
  authName: STAFF_USER.name,
  authUin: STAFF_USER.uin,
  authEmail: STAFF_USER.uid,
});

test('institution admin can change their own role and bulk edit and delete Owners', async ({
  page,
  courseInstance,
}, testInfo) => {
  const course = await selectCourseById(courseInstance.course_id);
  const admin = await getOrCreateUser(STAFF_USER);
  const owner = await getOrCreateUser({
    uid: 'other-owner@example.com',
    name: 'Other owner',
    uin: null,
  });
  await ensureInstitutionAdministrator({
    institution_id: course.institution_id,
    user_id: admin.id,
    authn_user_id: '1',
  });
  const grantId = await queryScalar(
    sql.select_institution_administrator_id,
    { institution_id: course.institution_id, user_id: admin.id },
    IdSchema,
  );
  try {
    for (const user of [admin, owner]) {
      await insertCoursePermissionsByUserUid({
        course_id: course.id,
        uid: user.uid,
        course_role: 'Owner',
        authn_user_id: '1',
      });
    }
    await page.goto(`/pl/course/${course.id}/course_admin/staff`);
    const ownRow = page.getByRole('row').filter({ hasText: admin.uid });
    await ownRow.getByRole('button', { name: 'Owner', exact: true }).click();
    await page.getByRole('radio', { name: 'Viewer', exact: true }).check();
    await page.getByRole('button', { name: 'Change access', exact: true }).click();
    await expect(ownRow.getByRole('button', { name: 'Viewer', exact: true })).toBeVisible();
    expect(await selectCoursePermissionForUser({ course_id: course.id, user_id: admin.id })).toBe(
      'Viewer',
    );

    await page.getByRole('checkbox', { name: `Select ${admin.uid}`, exact: true }).check();
    await page.getByRole('checkbox', { name: `Select ${owner.uid}`, exact: true }).check();
    await page.getByRole('button', { name: 'Edit access', exact: true }).click();
    const editDialog = page.getByRole('dialog');
    await expect(editDialog.getByText('Edit access for 2 users')).toBeVisible();
    await editDialog.getByLabel('Course content access').selectOption('Owner');
    await editDialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(editDialog).not.toBeVisible();
    await expect(ownRow.getByRole('button', { name: 'Owner', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog.getByRole('button', { name: 'Remove 2 users' })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath('institution-admin-remove-owners.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await deleteDialog.getByRole('button', { name: 'Remove 2 users' }).click();
    await expect(
      page.getByRole('checkbox', { name: `Select ${admin.uid}`, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('checkbox', { name: `Select ${owner.uid}`, exact: true }),
    ).toHaveCount(0);
  } finally {
    await deleteInstitutionAdministrator({
      institution_id: course.institution_id,
      unsafe_institution_administrator_id: grantId,
      authn_user_id: '1',
    });
  }
});

test('regular Owner controls protect self and Owners and disappear for an Editor', async ({
  page,
  courseInstance,
}) => {
  const courseId = courseInstance.course_id;
  const user = await getOrCreateUser(STAFF_USER);
  const owner = await getOrCreateUser({
    uid: 'regular-owner@example.com',
    name: 'Regular owner',
    uin: null,
  });
  for (const staff of [user, owner]) {
    await insertCoursePermissionsByUserUid({
      course_id: courseId,
      uid: staff.uid,
      course_role: 'Owner',
      authn_user_id: '1',
    });
  }
  await upsertCourseInstancePermissionsRole({
    course_id: courseId,
    course_instance_id: courseInstance.id,
    user_id: user.id,
    course_instance_role: 'Student Data Editor',
    authn_user_id: '1',
  });
  await page.goto(`/pl/course/${courseId}/course_admin/staff`);
  const ownRow = page.getByRole('row').filter({ hasText: user.uid });
  await expect(page.getByRole('button', { name: 'Add users', exact: true })).toBeVisible();
  await expect(ownRow.getByRole('button', { name: 'Owner', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: `Select ${user.uid}`, exact: true }).check();
  await expect(page.getByRole('button', { name: 'Edit access', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: `Select ${user.uid}`, exact: true }).uncheck();
  await page.getByRole('checkbox', { name: `Select ${owner.uid}`, exact: true }).check();
  await expect(page.getByRole('button', { name: 'Edit access', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await page
    .getByRole('row')
    .filter({ hasText: owner.uid })
    .getByRole('button', { name: 'Owner', exact: true })
    .click();
  await expect(page.getByRole('radio', { name: 'Editor', exact: true })).toBeEnabled();

  await updateCoursePermissionsRole({
    course_id: courseId,
    user_id: user.id,
    course_role: 'Editor',
    authn_user_id: '1',
  });
  const response = await page.reload();
  expect(response!.status()).toBe(403);
  await expect(page.getByRole('button', { name: 'Add users', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit access', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
});
