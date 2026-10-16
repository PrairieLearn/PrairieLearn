import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { updateCourseColumn } from '../../models/course.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({
  isEnterprise: true,
  redisUrl: 'redis://localhost:6379',
  features: { 'course-agent': true },
  courseAgent: {
    workerUrl: 'http://localhost:8791',
    serviceToken: 'local-fixture-service-token-not-a-secret',
  },
});
test.skip(!process.env.COURSE_AGENT_FIXTURE_URL, 'Run the local course-agent fixture first.');
test('course owners can chat, steer and stop in the browser', async ({
  page,
  courseInstance,
}, testInfo) => {
  test.setTimeout(60_000);
  const courseId = courseInstance.course_id;
  await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid: 'dev@example.com',
    course_role: 'Owner',
    authn_user_id: '1',
  });
  await updateCourseColumn({
    courseId,
    columnName: 'repository',
    value: 'https://github.com/example/course.git',
    authnUserId: '1',
  });
  await updateCourseColumn({ courseId, columnName: 'branch', value: 'main', authnUserId: '1' });
  await page.goto(`/pl/course/${courseId}/course_admin/settings`);
  await page.getByRole('button', { name: 'Open course agent' }).click();
  const composer = page.getByLabel('Message', { exact: true });
  await composer.fill('Please inspect the course.');
  await composer.press('Enter');
  await expect(page.getByText('Started.', { exact: true })).toHaveCount(1);
  await composer.fill('Use a different approach.');
  await composer.press('Enter');
  await expect(page.getByText('Use a different approach.', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('runtime.png'), fullPage: true });
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(page.getByRole('complementary', { name: 'Course agent' })).toHaveCSS(
    'width',
    '350px',
  );
  await page.screenshot({ path: testInfo.outputPath('runtime-narrow.png'), fullPage: true });

  await updateCourseColumn({
    courseId,
    columnName: 'branch',
    value: 'another-branch',
    authnUserId: '1',
  });
  await composer.fill('Do more work.');
  await composer.press('Enter');
  await expect(
    page.getByText('The course repository or branch changed. Start a new conversation.'),
  ).toBeVisible();
  await expect(composer).toHaveValue('Do more work.');
  await page.reload();
  await page.getByRole('button', { name: 'Open course agent' }).click();
  await expect(page.getByText('What would you like to work on?', { exact: true })).toBeVisible();
});

const unavailableTest = createTest({
  isEnterprise: true,
  features: { 'course-agent': true },
  courseAgent: { workerUrl: 'http://localhost:8791', serviceToken: null },
});

unavailableTest(
  'explains the missing connection token without opening chat',
  async ({ page, courseInstance }) => {
    await insertCoursePermissionsByUserUid({
      course_id: courseInstance.course_id,
      uid: 'dev@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
    const launcher = page.getByRole('button', { name: 'Open course agent' });
    await expect(launcher).toBeVisible();
    await expect(launcher).toBeDisabled();
    const trigger = launcher.locator('..');
    await trigger.hover();
    await expect(page.getByRole('tooltip')).toContainText('connection token is not configured');
    await page.getByRole('navigation', { name: 'Global navigation' }).hover();
    await trigger.focus();
    await expect(page.getByRole('tooltip')).toContainText('connection token is not configured');
    await expect(page.getByLabel('Message', { exact: true })).toHaveCount(0);
  },
);
