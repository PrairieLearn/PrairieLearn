import { selectConversations } from '../../models/course-agent-conversation.js';
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
    pricing: {},
    maxConcurrentPerUser: 2,
    maxConcurrentPerCourse: 5,
    maxRequestsPerHour: 30,
    dailyCostLimit: 20,
  },
});
test.skip(!process.env.COURSE_AGENT_FIXTURE_URL, 'Run the local course-agent fixture first.');
test('conversation and unsent draft persist across course pages', async ({
  page,
  courseInstance,
}, testInfo) => {
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
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const composer = page.getByLabel('Ask about your course');
  await expect(composer).toBeVisible();
  await composer.fill('Please inspect the course.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Please inspect the course.', { exact: true })).toBeVisible();
  await composer.fill('Keep this draft.');
  await page.goto(`/pl/course/${courseId}/course_admin/questions`);
  await expect(composer).toHaveValue('Keep this draft.');
  await expect(page.getByText('Please inspect the course.', { exact: true })).toBeVisible();
  await expect(page.getByText('Finished.', { exact: false })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Course review');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Conversation')).toContainText('Course review');
  await page.screenshot({ path: testInfo.outputPath('course-agent.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composer).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('course-agent-mobile.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open course agent' })).toBeVisible();
  await page.getByRole('button', { name: 'Open course agent' }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(
    page.getByText('Choose or create a conversation to edit your course.'),
  ).toBeVisible();
});

test('denial after sandbox shutdown remains durable and resumes through a hidden continuation', async ({
  page,
  courseInstance,
}) => {
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
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByLabel('Ask about your course').fill('Prepare a change.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Prepare a change.', { exact: true })).toBeVisible();
  const [conversation] = await selectConversations({
    course_id: courseId,
    user_id: '1',
    authn_user_id: '1',
  });
  const root = `http://localhost:8791/agents/chat/${conversation.external_id}`;
  const headers = {
    Authorization: 'Bearer local-fixture-service-token-not-a-secret',
    'Content-Type': 'application/json',
  };
  const approval = await fetch(`${root}/test/approval`, { method: 'POST', headers, body: '{}' });
  expect(approval.ok).toBe(true);
  await expect(page.getByText('Approval required', { exact: true })).toBeVisible();
  const expire = await fetch(`${root}/test/advance`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ milliseconds: 10 * 60_000 + 1000 }),
  });
  expect(expire.ok).toBe(true);
  await page.getByRole('button', { name: 'Deny', exact: true }).click();
  await expect(page.getByText('Approval denied', { exact: true })).toBeVisible();
  await expect(
    page.getByText('The user denied this proposal. Nothing was published.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Ask about your course').fill('Next request');
  await expect(page.getByRole('button', { name: /^(Send|Steer)$/ })).toBeEnabled();
  await page.reload();
  await expect(page.getByText('Approval denied', { exact: true })).toBeVisible();
  await expect(page.getByText(/push_sync result for operation/)).toHaveCount(0);
});
