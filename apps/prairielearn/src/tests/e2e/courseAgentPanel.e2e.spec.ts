import { updateCourseColumn } from '../../models/course.js';
import { selectUserByUid } from '../../models/user.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({
  features: {
    'cloud-agent': true,
    'cloud-agent-test-controls': true,
  },
  courseAgentRuntime: 'fake',
  courseAgentCapabilitySecret: 'course-agent-e2e-secret',
  courseAgentTestControlsEnabled: true,
  courseAgentIdleTimeoutSeconds: 60,
});

test('creates chats lazily and traces a fake sandbox lifecycle', async ({
  page,
  courseInstance,
}) => {
  const user = await selectUserByUid('dev@example.com');
  await updateCourseColumn({
    courseId: courseInstance.course_id,
    columnName: 'repository',
    value: 'https://github.com/PrairieLearn/test-course.git',
    authnUserId: user.id,
  });
  await updateCourseColumn({
    courseId: courseInstance.course_id,
    columnName: 'branch',
    value: 'master',
    authnUserId: user.id,
  });

  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
  await page.getByRole('button', { name: 'Open course agent' }).click();

  await expect(page.getByLabel('Course agent panel')).toBeVisible();
  await expect(page.getByText('No sandbox will be allocated yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Create chat' }).click();

  await expect(page.getByText('unallocated', { exact: true })).toBeVisible();
  await expect(page.getByText('Not allocated', { exact: true })).toBeVisible();
  await expect(page.getByText('/workspace', { exact: true })).toBeVisible();
  await expect(page.getByText('sandbox.requested', { exact: true })).toHaveCount(0);

  await page
    .getByLabel('Course agent instructions')
    .fill('Add a concise hint to the first question.');
  await page.getByRole('button', { name: 'Send prompt' }).click();

  await expect(
    page.getByText('The deterministic local runtime completed this turn.'),
  ).toBeVisible();
  await expect(page.getByText('ready', { exact: true })).toBeVisible();
  await expect(page.getByText('run completed', { exact: true })).toBeVisible();
  await expect(page.getByText('No backup yet', { exact: true })).toBeVisible();

  const runtimeEvents = page.getByText('Runtime events', { exact: true });
  await runtimeEvents.click();
  await expect(page.getByText('git.clone.started', { exact: true })).toBeVisible();
  await expect(page.getByText('agent.completed', { exact: true })).toBeVisible();
  await expect(page.getByText('workspace.backup.completed', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Kill sandbox' }).click();
  await expect(page.getByText('offline', { exact: true })).toBeVisible();
  await expect(page.getByText('test_kill', { exact: false })).toBeVisible();
  await expect(page.getByText('workspace.backup.completed', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByLabel('Chat').locator('option')).toHaveCount(2);
  await expect(page.getByText('unallocated', { exact: true })).toBeVisible();
});
