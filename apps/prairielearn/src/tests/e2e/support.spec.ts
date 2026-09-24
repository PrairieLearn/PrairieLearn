import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import {
  deleteCoursePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../../models/course-permissions.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const sql = loadSqlEquiv(import.meta.url);
const supportSlackUrl = 'https://example.com/support/slack';
const supportOfficeHoursUrl = 'https://example.com/support/office-hours';
const test = createTest({ supportSlackUrl, supportOfficeHoursUrl });

for (const access of ['course', 'course instance'] as const) {
  test(`opens support from the home page and ${access} staff pages`, async ({
    page,
    baseURL,
    courseInstance,
  }, testInfo) => {
    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
    });
    await page
      .context()
      .addCookies([{ name: 'pl_test_user', value: 'test_instructor', url: baseURL }]);

    if (access === 'course') {
      await insertCoursePermissionsByUserUid({
        course_id: courseInstance.course_id,
        uid: instructor.uid,
        course_role: 'Previewer',
        authn_user_id: instructor.id,
      });
    } else {
      await insertCourseInstancePermissions({
        course_id: courseInstance.course_id,
        course_instance_id: courseInstance.id,
        user_id: instructor.id,
        course_instance_role: 'Student Data Viewer',
        authn_user_id: instructor.id,
      });
    }

    try {
      await page.goto('/');
      const button = page.getByRole('button', { name: 'Get help', exact: true });
      await button.click();

      const dialog = page.getByRole('dialog', { name: 'Get help', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog).toBeFocused();
      await expect(dialog.getByRole('link', { name: 'Join Slack' })).toHaveAttribute(
        'href',
        supportSlackUrl,
      );
      await expect(dialog.getByRole('link', { name: 'Join office hours' })).toHaveAttribute(
        'href',
        supportOfficeHoursUrl,
      );
      await expect(dialog.getByRole('link', { name: 'Join office hours' })).toHaveAttribute(
        'target',
        '_blank',
      );
      await expect(dialog.getByText('Thursdays, 3–4 p.m. Central Time.')).toBeVisible();
      if (process.env.CAPTURE_SCREENSHOTS) {
        await page.screenshot({ path: testInfo.outputPath('support-desktop.png') });
      }

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(button).toBeFocused();

      await page.goto(`/pl/course_instance/${courseInstance.id}/instructor/assessments`);
      await expect(button).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
      await button.click();
      await expect(dialog).toBeVisible();
      await expect(dialog).toBeFocused();
      await expect(dialog.getByRole('link', { name: 'Join Slack' })).toBeVisible();
      if (process.env.CAPTURE_SCREENSHOTS) {
        await page.screenshot({ path: testInfo.outputPath('support-mobile.png') });
      }
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(button).toBeFocused();
    } finally {
      await deleteCoursePermissions({
        course_id: courseInstance.course_id,
        user_id: instructor.id,
        authn_user_id: instructor.id,
      });
    }
  });
}

test('omits support links for students, example-course visitors, and signed-out users', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  const student = await getOrCreateUser({
    uid: 'student@example.com',
    name: 'Student User',
    uin: '000000001',
  });
  await ensureUncheckedEnrollment({
    userId: student.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });
  await page.context().addCookies([{ name: 'pl_test_user', value: 'test_student', url: baseURL }]);

  async function expectNoSupport() {
    await expect(page.getByRole('button', { name: 'Get help', includeHidden: true })).toHaveCount(
      0,
    );
    expect(await page.content()).not.toContain(supportSlackUrl);
    expect(await page.content()).not.toContain(supportOfficeHoursUrl);
  }

  await page.goto('/');
  await expectNoSupport();
  await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
  await expectNoSupport();

  await execute(sql.set_example_course, { course_id: courseInstance.course_id, example: true });
  try {
    await page.goto('/');
    await expectNoSupport();
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/questions`);
    await expect(page.getByRole('link', { name: 'Questions', exact: true })).toBeVisible();
    await expectNoSupport();
  } finally {
    await execute(sql.set_example_course, { course_id: courseInstance.course_id, example: false });
  }

  await page.goto('/pl/logout');
  await expect(page).toHaveURL(/\/pl\/login/);
  await expectNoSupport();
});

const unconfiguredTest = createTest({ supportSlackUrl: null, supportOfficeHoursUrl: null });

unconfiguredTest(
  'offers documentation and email when community links are not configured',
  async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Get help', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Get help', exact: true });
    await expect(dialog.getByRole('link', { name: 'Join Slack' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'Join office hours' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'documentation' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'support@prairielearn.com' })).toHaveAttribute(
      'href',
      'mailto:support@prairielearn.com',
    );
  },
);
