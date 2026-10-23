import {
  insertCourseAgentConversation,
  updateCourseAgentConversationTitleIfDefault,
} from '../../ee/models/course-agent-conversation.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { getOrCreateUser } from '../utils/auth.js';
import { startScriptedAgent } from '../utils/course-agent-worker.js';

import { expect, test } from './fixtures.js';
import { setupWorkerServer } from './utils/server.js';

type Agent = Awaited<ReturnType<typeof startScriptedAgent>>;
const agentTest = test.extend<Record<never, never>, { agent: Agent }>({
  agent: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const agent = await startScriptedAgent();
      try {
        await use(agent);
      } finally {
        await agent.close();
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
          courseAgentServiceToken: 'scripted-local-test-only',
          features: { 'course-agent': true },
        },
      });
    },
    { scope: 'worker' },
  ],
});

async function prepare(courseId: string, agent: Agent, title: string) {
  const user = await getOrCreateUser({ uid: 'dev@example.com', name: 'Dev User', uin: 'dev' });
  await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  const serviceId = await agent.create();
  const conversation = await insertCourseAgentConversation({
    course_id: courseId,
    user_id: user.id,
    agent_conversation_id: serviceId,
  });
  await updateCourseAgentConversationTitleIfDefault({ id: conversation.id, title });
  return serviceId;
}

agentTest(
  'refreshes and switches without restarting a reply',
  async ({ page, courseInstance, agent }) => {
    const a = await prepare(courseInstance.course_id, agent, 'Conversation A');
    await prepare(courseInstance.course_id, agent, 'Conversation B');
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
    await page.getByRole('button', { name: 'Open course agent' }).click();
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Conversation A', exact: true }).click();
    await page.getByLabel('Message', { exact: true }).fill('Run once');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(async () => (await agent.control(a, 'stats')).ready).toBe(true);
    await agent.control(a, 'advance', 'Hello');
    await expect(page.getByText('Hello', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Hello', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Conversation B', exact: true }).click();
    await expect(page.getByText('Hello', { exact: true })).toHaveCount(0);
    await agent.control(a, 'advance', ' again');
    await agent.control(a, 'finish');
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Conversation A', exact: true }).click();
    await expect(page.getByText('Hello again', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    expect((await agent.control(a, 'stats')).calls).toBe(1);
  },
);

agentTest(
  'explicitly stops a reply before its first text arrives',
  async ({ page, courseInstance, agent }) => {
    const a = await prepare(courseInstance.course_id, agent, 'Stop test');
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
    await page.getByRole('button', { name: 'Open course agent' }).click();
    await page.getByLabel('Message', { exact: true }).fill('Wait for Stop');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.getByLabel('Message', { exact: true }).fill('Another message');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    expect((await agent.control(a, 'stats')).ready).toBe(false);
    await page.reload();
    await expect(page.getByText('Wait for Stop', { exact: true })).toBeVisible();
    expect((await agent.control(a, 'stats')).calls).toBe(1);
  },
);

agentTest(
  'recovers stored partial output after a Worker restart without rerunning the prompt',
  async ({ page, courseInstance, agent }) => {
    const id = await prepare(courseInstance.course_id, agent, 'Recovery test');
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
    await page.getByRole('button', { name: 'Open course agent' }).click();
    await page.getByLabel('Message', { exact: true }).fill('Interrupted turn');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(async () => (await agent.control(id, 'stats')).ready).toBe(true);
    // Cross the SDK's native buffering boundary before simulating an eviction.
    for (let i = 0; i < 12; i++) await agent.control(id, 'advance', 'partial ');
    await expect(page.getByText('partial '.repeat(12).trim(), { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close course agent' }).click();
    await agent.restart();
    await page.getByRole('button', { name: 'Open course agent' }).click();
    await expect(page.getByText(/partial partial/)).toBeVisible();
    await page.getByLabel('Message', { exact: true }).fill('Continue explicitly');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    expect((await agent.control(id, 'stats')).calls).toBe(0);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(async () => (await agent.control(id, 'stats')).ready).toBe(true);
    await agent.control(id, 'advance', 'Recovered');
    await agent.control(id, 'finish');
    await expect(page.getByText('Recovered', { exact: true })).toBeVisible();
    expect((await agent.control(id, 'stats')).calls).toBe(1);
  },
);
