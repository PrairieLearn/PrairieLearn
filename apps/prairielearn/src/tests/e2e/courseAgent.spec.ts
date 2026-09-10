import { randomUUID } from 'node:crypto';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { createCourseAgentTurn } from '../../models/course-agent.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { updateCourseColumn } from '../../models/course.js';
import { generateUser, selectUserByUid } from '../../models/user.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ courseAgentRuntime: 'fake', features: { 'course-agent': true } });
const sql = loadSqlEquiv(import.meta.url);

test.beforeEach(async ({ courseInstance }) => {
  await execute(sql.archive_conversations, { course_id: courseInstance.course_id });
  await updateCourseColumn({
    courseId: courseInstance.course_id,
    columnName: 'repository',
    value: 'https://github.com/PrairieLearn/test.git',
    authnUserId: (await getConfiguredUser()).id,
  });
});

test('shows loading in the open panel and collapsed launcher while history is pending', async ({
  page,
  courseInstance,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let releaseHistory!: () => void;
  const pending = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  await page.route('**/trpc/*', async (route) => {
    if (route.request().url().includes('courseAgent.history')) await pending;
    await route.continue();
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  await expect(panel.getByRole('status')).toHaveText('Loading conversation…');
  await expect(panel.getByRole('button', { name: 'Collapse course agent' })).toBeEnabled();
  const width = (await panel.boundingBox())!.width;
  await panel.getByRole('button', { name: 'Collapse course agent' }).click();
  const launcher = panel.getByRole('button', { name: 'Expand course agent' });
  await expect(launcher.getByLabel('Loading course agent')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('course-conversation-loading-rail.png') });
  releaseHistory();
  await expect(launcher.getByLabel('Loading course agent')).toHaveCount(0);
  await launcher.click();
  await expect(panel.getByRole('textbox', { name: 'Message course agent' })).toBeVisible();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(width);
});

test('updates activity badges without changing the last-message time', async ({
  page,
  courseInstance,
}, testInfo) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const input = panel.getByRole('textbox', { name: 'Message course agent' });
  const picker = panel.getByRole('button', { name: 'Conversation', exact: true });
  await input.fill('Build a numerical methods assessment');
  await input.press('Enter');
  await expect(picker).toContainText('Build a numerical methods assessment');
  await expect(picker.getByText('Build a numerical methods assessment', { exact: true })).toHaveCSS(
    'white-space',
    'nowrap',
  );
  const first = (await picker.getAttribute('data-conversation-id'))!;
  await picker.click();
  const item = panel.getByRole('menuitemradio', { name: /Build a numerical methods assessment/ });
  const lastMessageAt = await item.locator('time').getAttribute('datetime');
  await picker.click();
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await execute(sql.set_activity, { conversation_id: first, status: 'starting' });
  await picker.click();
  await expect(item.getByLabel('Conversation in progress')).toBeVisible({ timeout: 10000 });
  await expect(item.locator('time')).toHaveAttribute('datetime', lastMessageAt!);
  await page.screenshot({ path: testInfo.outputPath('course-conversation-active-menu.png') });
  await execute(sql.set_activity, { conversation_id: first, status: 'waiting_for_user' });
  await expect(item.getByLabel('Conversation in progress')).toHaveCount(0, { timeout: 10000 });
});

test('persists the instructor approval preference', async ({ page, courseInstance }) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const saved = page.waitForResponse(
    (response) => response.url().includes('courseAgent.setApprovalMode') && response.ok(),
  );
  await panel.getByRole('button', { name: 'Ask for approval', exact: true }).click();
  await panel.getByText('Always approve', { exact: true }).click();
  await saved;
  await expect(panel.getByRole('button', { name: 'Always approve', exact: true })).toBeVisible();
  await page.reload();
  await expect(panel.getByRole('button', { name: 'Always approve', exact: true })).toBeVisible();

  const reset = page.waitForResponse(
    (response) => response.url().includes('courseAgent.setApprovalMode') && response.ok(),
  );
  await panel.getByRole('button', { name: 'Always approve', exact: true }).click();
  await panel.getByText('Ask for approval', { exact: true }).click();
  await reset;
});

test('restores both turns and their tool history after a page reload', async ({
  page,
  courseInstance,
}) => {
  let starts = 0;
  page.on('request', (request) => {
    if (request.url().includes('courseAgent.start')) starts++;
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  for (const prompt of ['First persisted turn', 'Second persisted turn']) {
    await panel.getByRole('textbox', { name: 'Message course agent' }).fill(prompt);
    await panel.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(panel.getByRole('textbox', { name: 'Message course agent' })).toBeEnabled();
    await expect(
      panel.getByRole('article', { name: 'Message from PrairieLearn' }).last(),
    ).toContainText(prompt);
  }
  const transcript = await panel.getByRole('article').allTextContents();
  await page.reload();
  await expect(panel.getByRole('article', { name: 'Message from PrairieLearn' })).toHaveCount(2);
  await expect(panel.getByRole('article')).toHaveText(transcript);
  expect(starts).toBe(2);
});

test('switches between isolated conversations and continues the selected conversation', async ({
  page,
  courseInstance,
}, testInfo) => {
  let starts = 0;
  page.on('request', (request) => {
    if (request.url().includes('courseAgent.start')) starts++;
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const input = panel.getByRole('textbox', { name: 'Message course agent' });
  const picker = panel.getByRole('button', { name: 'Conversation', exact: true });
  await input.fill('Build a hashmap assessment');
  await input.press('Enter');
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(1);
  const first = (await picker.getAttribute('data-conversation-id'))!;
  const firstTranscript = await panel.getByRole('article').allTextContents();
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(panel.getByRole('article')).toHaveCount(0);
  await input.fill('Build a sorting assessment');
  await input.press('Enter');
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(1);
  const second = (await picker.getAttribute('data-conversation-id'))!;
  expect(second).not.toBe(first);
  await picker.click();
  const conversations = panel.getByRole('menuitemradio');
  await expect(conversations.first()).toContainText('Build a sorting assessment');
  const firstConversation = panel.getByRole('menuitemradio', {
    name: /Build a hashmap assessment/,
  });
  const firstLastMessageAt = await firstConversation.locator('time').getAttribute('datetime');
  await firstConversation.click();
  await expect(panel.getByRole('article')).toHaveText(firstTranscript);
  await picker.click();
  await expect(conversations.first()).toContainText('Build a sorting assessment');
  await picker.click();
  await input.fill('Add one more hashmap question');
  await input.press('Enter');
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(2);
  await picker.click();
  await expect(conversations.first()).toContainText('Build a hashmap assessment');
  await expect(firstConversation.locator('time')).not.toHaveAttribute(
    'datetime',
    firstLastMessageAt!,
  );
  const selected = page.waitForResponse(
    (response) => response.url().includes('courseAgent.selectConversation') && response.ok(),
  );
  await panel.getByRole('menuitemradio', { name: /Build a sorting assessment/ }).click();
  await selected;
  await expect(panel.getByRole('article', { name: 'Message from Dev User' })).toHaveCount(1);
  await expect(panel.getByRole('log')).toContainText('Build a sorting assessment');
  await expect(panel.getByRole('log')).not.toContainText('hashmap');
  await page.reload();
  await expect(picker).toHaveAttribute('data-conversation-id', second);
  await expect(panel.getByRole('log')).toContainText('Build a sorting assessment');
  expect(starts).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(picker).toBeVisible();
  await picker.click();
  await expect(
    panel.getByRole('menuitemradio', { name: /Build a sorting assessment/ }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByRole('menuitemradio').first().locator('time')).toHaveAttribute(
    'datetime',
    /T/,
  );
  await page.screenshot({ path: testInfo.outputPath('course-conversation-picker-mobile.png') });
});

test('switches away from an open stream without mixing conversations', async ({
  page,
  courseInstance,
}) => {
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      if (
        !url.pathname.endsWith('/course_agent/stream') ||
        url.searchParams.get('conversationId') !== document.documentElement.dataset.holdCourseStream
      ) {
        return fetch(input, init);
      }
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of [
              { type: 'start', messageId: url.searchParams.get('runId') },
              { type: 'text-start', id: 'text' },
              {
                type: 'text-delta',
                id: 'text',
                delta: 'Partial response from the first conversation',
              },
            ]) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            init?.signal?.addEventListener(
              'abort',
              () => controller.error(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    };
  });
  let starts = 0;
  page.on('request', (request) => {
    if (request.url().includes('courseAgent.start')) starts++;
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const input = panel.getByRole('textbox', { name: 'Message course agent' });
  const picker = panel.getByRole('button', { name: 'Conversation', exact: true });
  await input.fill('First conversation');
  await input.press('Enter');
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(1);
  const first = (await picker.getAttribute('data-conversation-id'))!;
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await input.fill('Second conversation');
  await input.press('Enter');
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(1);
  await picker.click();
  await panel.getByRole('menuitemradio', { name: /First conversation/ }).click();
  await expect(picker).toHaveAttribute('data-conversation-id', first);
  await page.evaluate((id) => {
    document.documentElement.dataset.holdCourseStream = id;
  }, first);
  await input.fill('Continue the first conversation');
  await input.press('Enter');
  await expect(
    panel.getByText('Partial response from the first conversation', { exact: true }),
  ).toBeVisible();
  await picker.click();
  await panel.getByRole('menuitemradio', { name: /Second conversation/ }).click();
  await expect(panel.getByRole('log')).toContainText('Second conversation');
  await expect(panel.getByRole('log')).not.toContainText('Partial response');
  await expect(input).toBeEnabled();
  await page.evaluate(() => {
    delete document.documentElement.dataset.holdCourseStream;
  });
  await picker.click();
  await panel.getByRole('menuitemradio', { name: /First conversation/ }).click();
  await expect(panel.getByRole('article', { name: 'Message from PrairieLearn' })).toHaveCount(2);
  await expect(panel.getByRole('log')).toContainText('Continue the first conversation');
  await expect(panel.getByRole('log')).not.toContainText('Second conversation');
  expect(starts).toBe(3);
});

test('does not expose another instructors conversation in the picker or history endpoint', async ({
  page,
  courseInstance,
}) => {
  const otherUser = await generateUser();
  const conversationId = randomUUID();
  await createCourseAgentTurn({
    conversation: {
      id: conversationId,
      user_id: otherUser.id,
      course_id: courseInstance.course_id,
      title: 'Private conversation',
      sandbox_id: `course-agent-${conversationId}`,
      runtime_status: 'starting',
    },
    runId: randomUUID(),
    prompt: 'Private prompt',
    promptDigest: 'test',
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const picker = page.getByRole('button', { name: 'Conversation', exact: true });
  await expect(picker).toHaveAttribute('data-conversation-id', 'new');
  await picker.click();
  await expect(page.getByRole('menuitemradio', { name: 'Private conversation' })).toHaveCount(0);
  for (const id of [conversationId, randomUUID()]) {
    const input = encodeURIComponent(JSON.stringify({ json: { conversationId: id } }));
    const response = await page.request.get(
      `/pl/course/${courseInstance.course_id}/trpc/courseAgent.history?input=${input}`,
    );
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('Private prompt');
  }
});

test('persists panel width across navigation and renders a loading shell before hydration', async ({
  page,
  courseInstance,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const url = `/pl/course/${courseInstance.course_id}/course_admin/instances`;
  await page.goto(url);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const saved = page.waitForResponse(
    (response) => response.url().includes('courseAgent.settings') && response.ok(),
  );
  await panel.getByRole('button', { name: 'Collapse course agent' }).click();
  await saved;
  await page.route('**/*.js*', (route) => route.abort());
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/questions`);
  await expect(panel.getByRole('button', { name: 'Expand course agent' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Expand course agent' })).toBeDisabled();
  expect((await panel.boundingBox())!.width).toBeLessThan(65);
  await page.screenshot({ path: testInfo.outputPath('course-agent-collapsed-loading.png') });
  await page.unroute('**/*.js*');
  await page.reload();
  const expanded = page.waitForResponse(
    (response) => response.url().includes('courseAgent.settings') && response.ok(),
  );
  await panel.getByRole('button', { name: 'Expand course agent' }).click();
  await expanded;
  await page.route('**/*.js*', (route) => route.abort());
  await page.goto(url);
  await expect(panel.getByRole('status')).toHaveText('Loading conversation…');
  expect((await panel.boundingBox())!.width).toBeGreaterThan(300);
  await page.screenshot({ path: testInfo.outputPath('course-agent-expanded-loading.png') });
});

test('shows only the active progress indicator and renders text before turn completion', async ({
  page,
  courseInstance,
}, testInfo) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.includes('/course_agent/stream?')) return originalFetch(input, init);
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'start',
                messageId: new URL(url, location.origin).searchParams.get('runId'),
              })}\n\n`,
            ),
          );
          window.addEventListener('test-course-chunk', (event) => {
            const chunk = (event as CustomEvent).detail;
            if (chunk === null) controller.close();
            else controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          });
        },
      });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
    };
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  await panel.getByRole('textbox', { name: 'Message course agent' }).fill('Stream a response');
  await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  const reply = panel.getByRole('article', { name: 'Message from PrairieLearn' });
  await expect(reply).toHaveCount(1);
  const working = panel.getByRole('status');
  await expect(working).toHaveText('Working…');
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test-course-chunk', {
        detail: {
          type: 'tool-input-available',
          toolCallId: 'startup',
          toolName: 'activity',
          input: { label: 'Starting agent' },
        },
      }),
    ),
  );
  await expect(reply.getByText('Starting agent', { exact: true })).toBeVisible();
  await expect(working).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test-course-chunk', {
        detail: {
          type: 'tool-output-available',
          toolCallId: 'startup',
          output: { label: 'Started agent' },
        },
      }),
    ),
  );
  await expect(working).toHaveText('Working…');
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test-course-chunk', {
        detail: {
          type: 'tool-input-available',
          toolCallId: 'read',
          toolName: 'activity',
          input: { label: 'Reading README.md' },
        },
      }),
    ),
  );
  await expect(reply.getByText('Reading README.md', { exact: true })).toBeVisible();
  await expect(working).toHaveCount(0);
  const spinner = reply.locator('.spinner-border');
  await expect(spinner).toHaveCSS('width', '16px');
  await expect(spinner).toHaveCSS('height', '16px');
  await page.screenshot({ path: testInfo.outputPath('course-chat-working.png') });
  await page.evaluate(() => {
    for (const chunk of [
      { type: 'tool-output-available', toolCallId: 'read', output: { label: 'Read README.md' } },
      { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', delta: 'First words' },
    ]) {
      window.dispatchEvent(new CustomEvent('test-course-chunk', { detail: chunk }));
    }
  });
  await expect(reply.getByText('First words', { exact: true })).toBeVisible();
  await expect(working).toBeVisible();
  await panel
    .getByRole('textbox', { name: 'Message course agent' })
    .fill('Follow up while the agent works');
  await expect(panel.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    for (const chunk of [
      { type: 'text-delta', id: 'text', delta: ', then the rest.' },
      { type: 'text-end', id: 'text' },
      { type: 'finish' },
      null,
    ]) {
      window.dispatchEvent(new CustomEvent('test-course-chunk', { detail: chunk }));
    }
  });
  await expect(reply.getByText('First words, then the rest.', { exact: true })).toBeVisible();
  await expect(working).toHaveCount(0);
});

test('reconnects an interrupted response without duplicating the turn or starting a new run', async ({
  page,
  courseInstance,
}) => {
  let streamRequests = 0;
  let startRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('courseAgent.start')) startRequests++;
  });
  await page.route('**/course_agent/stream?*', async (route) => {
    streamRequests++;
    if (streamRequests !== 1) return route.continue();
    const response = await route.fetch();
    const body = (await response.text())
      .split('\n\n')
      .filter((frame) => !frame.includes('"type":"finish"') && !frame.includes('[DONE]'))
      .join('\n\n');
    await route.fulfill({ response, body });
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  await panel.getByRole('textbox', { name: 'Message course agent' }).fill('Reconnect test');
  await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('connection was interrupted');
  await panel.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const reply = panel.getByRole('article', { name: 'Message from PrairieLearn' });
  await expect(reply).toHaveCount(1);
  await expect(reply.getByText('Edited README.md', { exact: true })).toHaveCount(1);
  await expect(
    reply.getByText('Updated /workspace/README.md for: Reconnect test', { exact: true }),
  ).toBeVisible();
  expect(startRequests).toBe(1);
  expect(streamRequests).toBe(2);
});

test('hides diagnostics and rejects direct requests without active administrator access', async ({
  page,
  courseInstance,
  context,
  baseURL,
}) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const user = await selectUserByUid('dev@example.com');
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  await context.addCookies([
    { name: 'pl2_access_as_administrator', value: 'inactive', url: baseURL },
  ]);
  await page.reload();
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByText('Conversation info (only visible to administrators)', { exact: true }),
  ).toHaveCount(0);
  const input = encodeURIComponent(
    JSON.stringify({
      json: {
        conversationId: '00000000-0000-4000-8000-000000000000',
        sandboxId: 'course-agent-test',
      },
    }),
  );
  const response = await page.request.get(
    `/pl/course/${courseInstance.course_id}/trpc/courseAgent.diagnostics?input=${input}`,
  );
  expect(response.status()).toBe(403);
});

test('sends with Enter and keeps formatted responses and activity within each turn', async ({
  page,
  courseInstance,
}, testInfo) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const input = panel.getByRole('textbox', { name: 'Message course agent' });

  await expect(panel.getByRole('switch')).toHaveCount(0);
  await expect(
    panel.getByText('Conversation info (only visible to administrators)', { exact: true }),
  ).toBeVisible();
  await input.fill('First `inline`');
  await input.press('Enter');
  await expect(panel.getByRole('article', { name: 'Message from PrairieLearn' })).toHaveCount(1);
  await expect(
    panel
      .getByRole('article', { name: 'Message from PrairieLearn' })
      .getByText('inline', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(1);
  await expect(
    panel
      .getByRole('article', { name: 'Message from Dev User' })
      .getByText('Dev User', { exact: true }),
  ).toBeVisible();
  await expect(
    panel
      .getByRole('article', { name: 'Message from PrairieLearn' })
      .getByText('PrairieLearn', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('article', { name: 'Message from Dev User' }).locator('time'),
  ).toHaveAttribute('datetime', /T/);

  await input.fill('Second');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('Second\n');
  await input.press('Enter');
  await expect(panel.getByRole('article', { name: 'Message from Dev User' })).toHaveCount(2);
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(2);
  const replies = panel.getByRole('article', { name: 'Message from PrairieLearn' });
  await expect(replies.first().getByText('Edited README.md', { exact: true })).toBeVisible();
  await expect(replies.last().getByText('Edited README.md', { exact: true })).toBeVisible();
  await expect(replies.first().getByText('Started agent', { exact: true })).toBeVisible();
  await expect(replies.last().getByText('Started agent', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Set up course', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Worked for/ })).toHaveCount(0);
  await panel
    .getByText('Conversation info (only visible to administrators)', { exact: true })
    .click();
  await expect(panel.getByText('Token usage', { exact: true })).toBeVisible();
  await expect(panel.getByText('Worker status: waiting_for_user', { exact: true })).toBeVisible();
  await expect(panel.getByText('conversation_state (PostgreSQL)', { exact: true })).toBeVisible();
  await expect(panel.getByText('sandbox_state (PostgreSQL)', { exact: true })).toBeVisible();
  await expect(
    panel.getByText('conversation_state (PostgreSQL)', { exact: true }).locator('+ dd'),
  ).toHaveText('waiting_for_user');
  await expect(
    panel.getByText('sandbox_state (PostgreSQL)', { exact: true }).locator('+ dd'),
  ).toHaveText('ready');
  await expect(
    panel.getByText('process_id (PostgreSQL)', { exact: true }).locator('+ dd'),
  ).toHaveText('null');
  await panel.getByText('process_id (PostgreSQL)', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('course-chat-tools.png') });
});

test('reserves desktop space for the panel and fills the mobile viewport', async ({
  page,
  courseInstance,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const content = page.getByRole('main');
  const panelBox = await panel.boundingBox();
  const contentBox = await content.boundingBox();
  expect(contentBox!.x + contentBox!.width).toBeLessThanOrEqual(panelBox!.x);
  expect(contentBox!.width).toBeGreaterThan(480);
  expect(panelBox!.width).toBeLessThan(481);
  const collapseBox = await panel
    .getByRole('button', { name: 'Collapse course agent' })
    .boundingBox();
  expect(collapseBox!.x - panelBox!.x).toBeLessThan(40);
  await expect(panel.getByText('QA 101', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('course-chat-desktop.png') });

  await panel.getByRole('button', { name: 'Collapse course agent' }).click();
  await expect(panel.getByRole('button', { name: 'Expand course agent' })).toBeVisible();
  await panel.getByRole('button', { name: 'Expand course agent' }).click();

  await page.setViewportSize({ width: 1000, height: 900 });
  expect(await panel.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1000, height: 900 });
  await panel.getByRole('button', { name: 'Close course agent' }).click();
  await expect(panel.getByRole('button', { name: 'Expand course agent' })).toBeVisible();
  expect((await content.boundingBox())!.width).toBeGreaterThan(600);
  await panel.getByRole('button', { name: 'Expand course agent' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  const mobileBox = await panel.boundingBox();
  expect(mobileBox).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await expect(panel.getByRole('button', { name: 'Close course agent' })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Message course agent' })).toBeVisible();
  await expect(panel.locator('.course-agent-panel-content')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('course-chat-mobile.png') });
});

test('contains long messages and tool paths without widening the panel', async ({
  page,
  courseInstance,
}, testInfo) => {
  const path = `/workspace/course/questions/${'veryLongQuestionDirectory'.repeat(12)}/question.html`;
  const code = `const path = "${path}";`;
  await page.route('**/course_agent/stream?*', async (route) => {
    const events = [
      { type: 'start', messageId: 'overflow-test' },
      {
        type: 'tool-input-available',
        toolCallId: 'read',
        toolName: 'activity',
        input: { label: `Reading ${path}` },
      },
      { type: 'tool-output-available', toolCallId: 'read', output: { label: `Read ${path}` } },
      { type: 'text-start', id: 'text' },
      {
        type: 'text-delta',
        id: 'text',
        delta: `Created \`${path}\`.\n\n\`\`\`js\n${code}\n\`\`\``,
      },
      { type: 'text-end', id: 'text' },
      { type: 'finish' },
    ];
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      body:
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const input = panel.getByRole('textbox', { name: 'Message course agent' });
  await input.fill(path);
  await input.press('Enter');
  const reply = panel.getByRole('article', { name: 'Message from PrairieLearn' });
  const tool = reply.getByText(`Read ${path}`, { exact: true });
  await expect(tool).toBeVisible();
  const transcript = panel.getByRole('log', { name: 'Conversation messages' });
  for (const width of [1440, 1200, 1000, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => transcript.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width + 1);
    for (const element of [
      tool,
      input,
      panel.getByRole('article', { name: 'Message from Dev User' }),
    ]) {
      const box = (await element.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(panelBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
    }
    expect(await tool.evaluate((element) => element.clientHeight)).toBeGreaterThan(30);
    const codeBlock = reply.locator('pre');
    expect(await codeBlock.evaluate((element) => element.scrollWidth)).toBeGreaterThan(
      await codeBlock.evaluate((element) => element.clientWidth),
    );
    await page.screenshot({ path: testInfo.outputPath(`course-chat-long-path-${width}.png`) });
  }
});

test('scrolls on send and jumps to the latest turn after reload', async ({
  page,
  courseInstance,
}) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const input = panel.getByRole('textbox', { name: 'Message course agent' });
  const transcript = panel.getByRole('log', { name: 'Conversation messages' });
  await input.fill('A long test message.\n'.repeat(50));
  await input.press('Enter');
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(1);
  await transcript.hover();
  await page.mouse.wheel(0, -10000);
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBeLessThan(100);
  await input.fill('Latest message');
  await input.press('Enter');
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(2);
  await expect
    .poll(() =>
      transcript.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThan(5);
  await page.addInitScript(() => {
    const offsets: number[] = [];
    document.addEventListener(
      'scroll',
      (event) => {
        const element = event.target;
        if (!(element instanceof HTMLElement) || element.getAttribute('role') !== 'log') return;
        offsets.push(element.scrollHeight - element.clientHeight - element.scrollTop);
        document.documentElement.dataset.courseAgentScrollOffsets = JSON.stringify(offsets);
      },
      { capture: true },
    );
  });
  await page.reload();
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(2);
  await expect
    .poll(() =>
      transcript.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThan(5);
  const offsets = await page.evaluate(() =>
    JSON.parse(document.documentElement.dataset.courseAgentScrollOffsets!),
  );
  expect(offsets.length).toBeGreaterThan(0);
  expect(offsets.every((offset: number) => offset < 5)).toBe(true);
});
