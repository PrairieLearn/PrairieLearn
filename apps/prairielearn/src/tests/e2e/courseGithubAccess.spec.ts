import type { Page } from '@playwright/test';

import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../../models/course-permissions.js';
import { updateCourseColumn } from '../../models/course.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({
  githubClientToken: 'test-token',
  authUid: 'github-owner@example.com',
  authName: 'Course Owner',
});
const repositoryUrl = 'https://github.com/PrairieLearn/pl-qa101';

test.beforeEach(async ({ courseInstance }) => {
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: 'github-owner@example.com',
    course_role: 'Owner',
    authn_user_id: '1',
  });
});

async function screenshot(page: Page, name: string) {
  if (process.env.GITHUB_ACCESS_SCREENSHOTS) {
    await page.screenshot({
      path: `${process.env.GITHUB_ACCESS_SCREENSHOTS}/${name}.png`,
      animations: 'disabled',
    });
  }
}

async function setRepository(courseId: string, value: string) {
  await updateCourseColumn({ courseId, columnName: 'repository', value, authnUserId: '1' });
}

async function showAccessSection(page: Page) {
  await page.getByRole('heading', { name: 'Access to GitHub repository' }).scrollIntoViewIfNeeded();
  await page.getByLabel('Branch', { exact: true }).scrollIntoViewIfNeeded();
}

test('Owner can request access, correct errors, and see invitation and access confirmations', async ({
  page,
  courseInstance,
}) => {
  await setRepository(courseInstance.course_id, 'git@github.com:PrairieLearn/pl-qa101.git');
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
  await showAccessSection(page);
  await expect(
    page.getByRole('link', { name: 'grant other people access on GitHub' }),
  ).toHaveAttribute('href', `${repositoryUrl}/settings/access`);
  await screenshot(page, '01-owner');
  await page.getByRole('button', { name: 'Grant myself access', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'create a free account' })).toHaveAttribute(
    'href',
    'https://github.com/signup',
  );
  await screenshot(page, '02-dialog');
  await dialog.getByLabel('GitHub username').fill('user@example.com');
  await dialog.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(dialog.getByText('Enter a valid GitHub username.')).toBeVisible();
  await expect(dialog.getByLabel('GitHub username')).toHaveAttribute('aria-invalid', 'true');
  await screenshot(page, '03-invalid-username');

  await page.route('**/trpc/githubAccess.grant', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          json: {
            message:
              'GitHub could not grant access. Check the username and try again. If it is correct, contact support for help with repository access or organization restrictions.',
            code: -32600,
            data: { code: 'BAD_REQUEST', httpStatus: 400 },
          },
        },
      }),
    });
  });
  await dialog.getByLabel('GitHub username').fill('course-owner');
  await dialog.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('GitHub could not grant access.');
  await screenshot(page, '04-github-error');

  await page.unroute('**/trpc/githubAccess.grant');
  let finishRequest: () => void = () => {};
  const pendingRequest = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  await page.route('**/trpc/githubAccess.grant', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ json: { username: 'course-owner' } });
    await pendingRequest;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: { data: { json: { username: 'course-owner', invited: true } } },
      }),
    });
  });
  await dialog.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Granting access…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await screenshot(page, '05-pending');
  finishRequest();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'An invitation for Admin access is ready for course-owner.',
  );
  await expect(page.getByRole('link', { name: 'Accept the invitation on GitHub' })).toHaveAttribute(
    'href',
    `${repositoryUrl}/invitations`,
  );
  await showAccessSection(page);
  await screenshot(page, '06-invitation');

  await page.unroute('**/trpc/githubAccess.grant');
  await page.route('**/trpc/githubAccess.grant', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: { data: { json: { username: 'course-owner', invited: false } } },
      }),
    });
  });
  await page.getByRole('button', { name: 'Grant myself access', exact: true }).click();
  await dialog.getByLabel('GitHub username').fill('course-owner');
  await dialog.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('alert')).toContainText('course-owner now has Admin access');
  await showAccessSection(page);
  await screenshot(page, '07-access-granted');
});

test('non-Owner is directed to course staff', async ({ page, courseInstance }) => {
  await getOrCreateUser({
    uid: 'instructor@example.com',
    name: 'Alex Instructor',
    email: 'alex@example.com',
    uin: '12345678',
  });
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: 'instructor@example.com',
    course_role: 'Owner',
    authn_user_id: '1',
  });
  const user = await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: 'github-owner@example.com',
    course_role: 'Owner',
    authn_user_id: '1',
  });
  await updateCoursePermissionsRole({
    course_id: courseInstance.course_id,
    user_id: user.id,
    course_role: 'Editor',
    authn_user_id: '1',
  });
  await setRepository(courseInstance.course_id, 'git@github.com:PrairieLearn/pl-qa101.git');
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
  await expect(page.getByRole('button', { name: 'Grant myself access' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'see Staff list' })).toHaveAttribute(
    'href',
    `/pl/course/${courseInstance.course_id}/course_admin/staff`,
  );
  await showAccessSection(page);
  await screenshot(page, '08-non-owner');
  await page.getByRole('link', { name: 'see Staff list' }).click();
  await expect(page.getByRole('heading', { name: 'Course owners' })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'instructor@example.com', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add users' })).toHaveCount(0);
  await screenshot(page, '11-owner-list');
});

test('non-GitHub repositories have no GitHub access section', async ({ page, courseInstance }) => {
  await setRepository(courseInstance.course_id, 'git@gitlab.com:University/pl-qa101.git');
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
  await expect(page.getByRole('heading', { name: 'Access to GitHub repository' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).scrollIntoViewIfNeeded();
  await screenshot(page, '09-non-github');
});

const unconfiguredTest = createTest({ githubClientToken: null });
unconfiguredTest(
  'Owner sees support guidance when GitHub integration is unavailable',
  async ({ page, courseInstance }) => {
    await setRepository(courseInstance.course_id, 'git@github.com:PrairieLearn/pl-qa101.git');
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
    await expect(page.getByRole('button', { name: 'Grant myself access' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText(
      'GitHub access cannot be granted on this server.',
    );
    await showAccessSection(page);
    await screenshot(page, '10-unconfigured');
  },
);
