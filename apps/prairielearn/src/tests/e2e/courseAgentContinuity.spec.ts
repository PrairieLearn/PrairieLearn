import {
  insertCourseAgentConversation,
  updateCourseAgentConversationTitleIfDefault,
} from '../../ee/models/course-agent-conversation.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { getOrCreateUser } from '../utils/auth.js';
import { CourseAgentTestService } from '../utils/course-agent-service.js';

import { expect, test } from './fixtures.js';
import { setupWorkerServer } from './utils/server.js';

const agentTest = test.extend<Record<never, never>, { agent: CourseAgentTestService }>({
  agent: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const service = new CourseAgentTestService();
      await service.start();
      try {
        await use(service);
      } finally {
        await service.close();
      }
    },
    { scope: 'worker' },
  ],
  workerPort: [
    async ({ testCoursePath, agent }, use, workerInfo) => {
      await setupWorkerServer(workerInfo, use, {
        courseDirs: [testCoursePath],
        configOverrides: {
          isEnterprise: true,
          courseAgentServiceUrl: agent.url,
          courseAgentServiceToken: 'test-service-token',
          features: { 'course-agent': true },
        },
      });
    },
    { scope: 'worker' },
  ],
});

async function prepare(courseId: string, agent: CourseAgentTestService, title: string) {
  const user = await getOrCreateUser({ uid: 'dev@example.com', name: 'Dev User', uin: 'dev' });
  await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  const serviceId = agent.create();
  const conversation = await insertCourseAgentConversation({
    course_id: courseId,
    user_id: user.id,
    agent_conversation_id: serviceId,
  });
  await updateCourseAgentConversationTitleIfDefault({ id: conversation.id, title });
  return { ...conversation, serviceId };
}

agentTest(
  'refreshes and switches during generation, and tracks unread completions',
  async ({ page, courseInstance, agent }) => {
    const a = await prepare(courseInstance.course_id, agent, 'Conversation A');
    await prepare(courseInstance.course_id, agent, 'Conversation B');
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
    await page.getByRole('button', { name: 'Open course agent' }).click();
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await page.getByRole('button', { name: /^Conversation A/ }).click();
    await page.getByLabel('Message', { exact: true }).fill('Run A');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(
        () =>
          agent.commands.filter(
            (entry) => entry.id === a.serviceId && entry.command.method === 'turn.start',
          ).length,
      )
      .toBe(1);
    agent.advance(a.serviceId, 'Hello');
    await expect(page.getByText('Hello', { exact: true })).toHaveCount(1);
    await page.reload();
    await expect(page.getByText('Hello', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
    agent.advance(a.serviceId, ' again');
    await expect(page.getByText('Hello again', { exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await page.getByRole('button', { name: /^Conversation B/ }).click();
    agent.finish(a.serviceId);
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    const aItem = page.getByRole('button', { name: /^Conversation A/ });
    await expect(aItem.getByLabel('Unread reply')).toBeVisible();
    await expect(aItem.getByText('Generating reply')).toHaveCount(0);
    await aItem.click();
    await expect(page.getByText('Hello again', { exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await expect(
      page.getByRole('button', { name: /^Conversation A/ }).getByLabel('Unread reply'),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByText('Hello again', { exact: true })).toHaveCount(1);
    expect(
      agent.commands.filter(
        (entry) => entry.id === a.serviceId && entry.command.method === 'turn.start',
      ),
    ).toHaveLength(1);
    await page.getByRole('button', { name: 'Close course agent' }).click();
    await expect.poll(() => agent.observers(a.serviceId)).toBe(0);
  },
);

agentTest(
  'reconnects without resending and explicitly stops the observed turn',
  async ({ page, courseInstance, agent }) => {
    const conversation = await prepare(courseInstance.course_id, agent, 'Reconnect and Stop');
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
    await page.getByRole('button', { name: 'Open course agent' }).click();
    await page.getByLabel('Message', { exact: true }).fill('Run once');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(() => agent.conversations.get(conversation.serviceId)?.summary.status)
      .toBe('waiting_for_agent');
    agent.advance(conversation.serviceId, 'Partial reply');
    await expect(page.getByText('Partial reply', { exact: true })).toBeVisible();
    agent.disconnect(conversation.serviceId);
    await expect.poll(() => agent.observers(conversation.serviceId)).toBe(2);
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    await expect(page.getByText('Partial reply', { exact: true })).toHaveCount(1);
    expect(
      agent.commands.filter(
        (entry) => entry.id === conversation.serviceId && entry.command.method === 'turn.start',
      ),
    ).toHaveLength(1);
    await page.getByLabel('Message', { exact: true }).fill('Finish without output');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(() => agent.conversations.get(conversation.serviceId)?.summary.status)
      .toBe('waiting_for_agent');
    agent.finish(conversation.serviceId);
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    await expect(page.getByText('Thinking…', { exact: true })).toHaveCount(0);
  },
);
