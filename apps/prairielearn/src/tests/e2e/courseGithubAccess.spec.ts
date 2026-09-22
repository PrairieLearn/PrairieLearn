import type { EnumCourseRole } from '../../lib/db-types.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../../models/course-permissions.js';
import { updateCourseColumn } from '../../models/course.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({
  githubClientToken: 'test-token',
  isEnterprise: true,
  authUid: 'github-owner@example.com',
  authName: 'Course Owner',
});
const repositoryUrl = 'https://github.com/PrairieLearn/pl-qa101';

async function setRole(courseId: string, uid: string, courseRole: EnumCourseRole) {
  const user = await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid,
    course_role: courseRole,
    authn_user_id: '1',
  });
  await updateCoursePermissionsRole({
    course_id: courseId,
    user_id: user.id,
    course_role: courseRole,
    authn_user_id: '1',
  });
  return user;
}

test.beforeEach(async ({ courseInstance }) => {
  await setRole(courseInstance.course_id, 'github-owner@example.com', 'Owner');
  await updateCourseColumn({
    courseId: courseInstance.course_id,
    columnName: 'repository',
    value: repositoryUrl,
    authnUserId: '1',
  });
});

test('Owner requests GitHub access, recovers from an error, and edits staff', async ({
  page,
  courseInstance,
}) => {
  await setRole(courseInstance.course_id, 'instructor@example.com', 'Editor');
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
  await expect(
    page.getByRole('link', { name: 'grant other people access on GitHub' }),
  ).toHaveAttribute('href', `${repositoryUrl}/settings/access`);
  await page.getByRole('button', { name: 'Grant myself access', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'create a free account' })).toHaveAttribute(
    'href',
    'https://github.com/signup',
  );
  await dialog.getByLabel('GitHub username').fill('user@example.com');
  await dialog.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(dialog.getByText('Enter a valid GitHub username.')).toBeVisible();

  await page.route('**/trpc/githubAccess.grant', async (route) => {
    await route.fulfill({
      status: 400,
      json: {
        error: {
          json: {
            message: 'GitHub could not grant access. Check the username and try again.',
            code: -32600,
            data: { code: 'BAD_REQUEST', httpStatus: 400 },
          },
        },
      },
    });
  });
  await dialog.getByLabel('GitHub username').fill('course-owner');
  await dialog.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('GitHub could not grant access.');

  await page.unroute('**/trpc/githubAccess.grant');
  let invited = true;
  await page.route('**/trpc/githubAccess.grant', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ json: { username: 'course-owner' } });
    await route.fulfill({
      json: { result: { data: { json: { username: 'course-owner', invited } } } },
    });
  });
  await dialog.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'An invitation for Admin access is ready for course-owner.',
  );
  await expect(page.getByRole('link', { name: 'Accept the invitation on GitHub' })).toHaveAttribute(
    'href',
    `${repositoryUrl}/invitations`,
  );

  invited = false;
  await page.getByRole('button', { name: 'Grant myself access', exact: true }).click();
  await dialog.getByLabel('GitHub username').fill('course-owner');
  await dialog.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('alert')).toContainText('course-owner now has Admin access');

  await page.getByRole('link', { name: 'Staff', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add users' })).toBeVisible();
  const instructorRow = page.getByRole('row').filter({
    has: page.getByRole('gridcell', { name: 'instructor@example.com', exact: true }),
  });
  await instructorRow.getByRole('button', { name: 'Editor', exact: true }).click();
  await page.getByRole('radio', { name: 'Viewer', exact: true }).check();
  await page.getByRole('button', { name: 'Change access', exact: true }).click();
  await expect(instructorRow.getByRole('button', { name: 'Viewer', exact: true })).toBeVisible();
});

test('non-Owner follows the Staff link to a read-only table', async ({ page, courseInstance }) => {
  await setRole(courseInstance.course_id, 'instructor@example.com', 'Owner');
  await setRole(courseInstance.course_id, 'github-owner@example.com', 'Editor');
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
  await expect(page.getByRole('button', { name: 'Grant myself access' })).toHaveCount(0);
  await page.getByRole('link', { name: 'see Staff list' }).click();
  await expect(page.getByRole('grid', { name: 'Staff', exact: true })).toBeVisible();
  await expect(
    page.getByRole('gridcell', { name: 'instructor@example.com', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add users' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Owner|Editor|Viewer|None)$/ })).toHaveCount(0);
});

test('instance-only staff can navigate to the read-only Staff page', async ({
  page,
  courseInstance,
}) => {
  const user = await setRole(courseInstance.course_id, 'github-owner@example.com', 'None');
  await insertCourseInstancePermissions({
    course_id: courseInstance.course_id,
    user_id: user.id,
    course_instance_id: courseInstance.id,
    course_instance_role: 'Student Data Viewer',
    authn_user_id: '1',
  });
  await page.goto(`/pl/course_instance/${courseInstance.id}/instructor/course_admin/settings`);
  await page.getByRole('link', { name: 'Staff', exact: true }).click();
  await expect(page.getByRole('grid', { name: 'Staff', exact: true })).toBeVisible();
  await expect(
    page.getByRole('gridcell', { name: 'github-owner@example.com', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add users' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Owner|Editor|Viewer|None)$/ })).toHaveCount(0);
});
