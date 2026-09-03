import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { selectUserByUid } from '../../models/user.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ courseAgentRuntime: 'fake', features: { 'course-agent': true } });

test('keeps compact working indicators visible and renders text before turn completion', async ({
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
  const working = panel.getByRole('status');
  await expect(working).toHaveText('Working…');
  const spinner = reply.locator('.spinner-border');
  await expect(spinner).toHaveCSS('width', '16px');
  await expect(spinner).toHaveCSS('height', '16px');
  expect((await working.boundingBox())!.y).toBeGreaterThan((await reply.boundingBox())!.y);
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
  await expect(panel.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
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
  await expect(panel.getByText('Status: Ready', { exact: true })).toBeVisible();
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

test('scrolls to the latest turn on send after the instructor scrolls up', async ({
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
});
