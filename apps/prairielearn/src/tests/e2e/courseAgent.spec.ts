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
  await expect(page.getByText('What would you like to work on?', { exact: true })).toBeVisible();
  const composer = page.getByLabel('Message', { exact: true });
  await expect(composer).toBeVisible();
  await composer.fill('Please inspect the course.');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await page.route('**/trpc/courseAgent.send', (route) => route.abort(), { times: 1 });
  await composer.press('Enter');
  await expect(composer).toHaveValue('Please inspect the course.');
  await composer.press('Enter');
  await expect(composer).toHaveValue('');
  await expect(page.getByText('Please inspect the course.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
  await expect(page.getByText('Working…', { exact: true })).toBeVisible();
  const conversationTitle = await page
    .getByRole('button', { name: 'Conversation', exact: true })
    .innerText();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByLabel('Working', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New response', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: conversationTitle, exact: false }).click();
  await composer.fill('Keep this draft.');
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await expect(page).toHaveURL(`/pl/course/${courseId}/course_admin/questions`);
  await expect(composer).toHaveValue('Keep this draft.');
  await expect(page.getByText('Please inspect the course.', { exact: true })).toBeVisible();
  await expect(page.getByText('Finished.', { exact: false })).toBeVisible({ timeout: 20000 });
  await page.reload();
  await expect(composer).toHaveValue('Keep this draft.');
  await expect(page.getByRole('complementary', { name: 'Course agent' })).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await expect(page.getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conversation statistics' })).toBeVisible();
  await page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Conversation statistics' }) })
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(page.getByRole('heading', { name: 'Conversation statistics' })).toBeHidden();
  const navbar = await page.getByRole('navigation', { name: 'Global navigation' }).boundingBox();
  const panel = await page.getByRole('complementary', { name: 'Course agent' }).boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(navbar!.y + navbar!.height);
  await page.screenshot({ path: testInfo.outputPath('course-agent.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composer).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('course-agent-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close course agent' }).click();
  await expect(page.getByRole('button', { name: 'Open course agent' })).toBeVisible();
  await page.getByRole('button', { name: 'Open course agent' }).click();
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
  await page.getByLabel('Message', { exact: true }).fill('Prepare a change.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Prepare a change.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
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
  await expect(page.getByText('Code change · Review requested', { exact: true })).toBeVisible();
  const expire = await fetch(`${root}/test/advance`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ milliseconds: 10 * 60_000 + 1000 }),
  });
  expect(expire.ok).toBe(true);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('Code change · Rejected', { exact: true })).toBeVisible();
  await expect(
    page.getByText('The user denied this proposal. Nothing was published.', { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Message', { exact: true }).fill('Next request');
  await expect(page.getByRole('button', { name: /^(Send|Steer)$/ })).toBeEnabled();
  await page.reload();
  await expect(page.getByText('Code change · Rejected', { exact: true })).toBeVisible();
  await expect(page.getByText(/push_sync result for operation/)).toHaveCount(0);
});
