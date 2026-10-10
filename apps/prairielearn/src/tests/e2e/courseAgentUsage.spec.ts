import { randomUUID } from 'node:crypto';

import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { updateCourseColumn } from '../../models/course.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({
  isEnterprise: true,
  redisUrl: 'redis://localhost:6379',
  nonVolatileRedisUrl: 'redis://localhost:6379',
  cacheKeyPrefix: `course-agent-usage-browser:${randomUUID()}:`,
  features: { 'course-agent': true },
  githubClientToken: 'fixture-no-github-network',
  courseAgent: {
    workerUrl: 'http://localhost:8791',
    serviceToken: 'local-fixture-service-token-not-a-secret',
    maxConcurrentPerUser: 2,
    hourlyCostLimit: 0.001,
    turnCostLimit: 2,
    requestCostLimit: 0.5,
    accountingEpoch: '00000000-0000-4000-8000-000000000001',
    maxTurnRuntimeMs: 1_800_000,
    maxToolCallsPerTurn: 100,
    maxModelRequestsPerTurn: 200,
  },
});
test.skip(!process.env.COURSE_AGENT_FIXTURE_URL, 'Run the local course-agent fixture first.');
test('shows retained native usage without treating a read as a financial charge', async ({
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
  const composer = page.getByLabel('Message', { exact: true });
  await composer.fill('Inspect the course.');
  await composer.press('Enter');
  await expect(page.getByText('Started.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  const statistics = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Conversation statistics' }) });
  await expect(statistics.getByText('100', { exact: true })).toBeVisible();
  await expect(statistics.getByText('20', { exact: true })).toBeVisible();
  await statistics.getByRole('button', { name: 'Close' }).click();
  await expect(statistics).toBeHidden();
  await composer.fill('More work.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(composer).toHaveValue('');
  await expect(page.getByText('More work.', { exact: true })).toBeVisible();
  await expect(page.getByText('Working…', { exact: true })).toBeVisible();
  await composer.fill('');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(statistics.getByText('100', { exact: true })).toBeVisible();
  await expect(statistics.getByText('20', { exact: true })).toBeVisible();
});
