import { randomUUID } from 'node:crypto';

import superjson from 'superjson';

import { createTest, expect } from './fixtures.js';

const test = createTest({ courseAgentRuntime: 'fake', features: { 'course-agent': true } });

test('waits for the final streamed reply before showing refresh and clears it on reload', async ({
  page,
  courseInstance,
}) => {
  const run = { conversationId: randomUUID(), runId: randomUUID(), sandboxId: 'refresh-test' };
  let completed = false;
  const approvalId = randomUUID();
  let syncedAt = '';
  await page.route('**/trpc/courseAgent.*', async (route) => {
    const method = new URL(route.request().url()).pathname.split('.').at(-1);
    let data: unknown;
    if (method === 'start') {
      data = run;
    } else if (method === 'history') {
      data = {
        run,
        activeRunId: null,
        warning: null,
        messages: completed
          ? [
              {
                id: run.runId,
                role: 'assistant',
                parts: [
                  { type: 'text', text: 'Published the complete update.', state: 'done' },
                  { type: 'data-courseSynced', data: { approvalId, commitSha: 'new', syncedAt } },
                ],
              },
            ]
          : [],
      };
    } else if (method === 'list') {
      data = { conversations: [] };
    } else if (method === 'getApprovalMode') {
      data = { mode: 'ask' };
    } else if (method === 'get' || method === 'diagnostics') {
      data = {
        ...run,
        activeRunId: null,
        status: 'waiting_for_user',
        pendingApproval: null,
        events: [],
      };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { result: { data: superjson.serialize(data) } } });
  });
  await page.addInitScript(
    ({ approvalId }) => {
      const fetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
        if (!url.pathname.endsWith('/course_agent/stream')) return fetch(input, init);
        return new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              const send = (event: unknown) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              send({ type: 'start', messageId: url.searchParams.get('runId') });
              send({ type: 'text-start', id: 'text' });
              send({ type: 'text-delta', id: 'text', delta: 'Published the ' });
              // Even an early marker must not expose refresh while the reply is streaming.
              send({
                type: 'data-courseSynced',
                data: { approvalId, commitSha: 'new', syncedAt: new Date().toISOString() },
              });
              window.addEventListener(
                'finish-test-reply',
                () => {
                  send({ type: 'text-delta', id: 'text', delta: 'complete update.' });
                  send({ type: 'text-end', id: 'text' });
                  send({ type: 'finish' });
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  controller.close();
                },
                { once: true },
              );
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      };
    },
    { approvalId },
  );
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  await panel.getByRole('textbox', { name: 'Message course agent' }).fill('Publish the update');
  await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByText('Published the', { exact: true })).toBeVisible();
  const refresh = panel.getByRole('button', { name: 'Refresh course content', exact: true });
  await expect(refresh).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('finish-test-reply')));
  await expect(panel.getByText('Published the complete update.', { exact: true })).toBeVisible();
  await expect(refresh).toBeVisible();
  completed = true;
  syncedAt = new Date().toISOString();
  await refresh.click();
  await expect(panel.getByText('Published the complete update.', { exact: true })).toBeVisible();
  await expect(refresh).toHaveCount(0);
});

test('reviews a full-screen diff and hides historical refresh after reloading', async ({
  page,
  courseInstance,
}, testInfo) => {
  const conversationId = randomUUID();
  const runId = randomUUID();
  const approvalId = randomUUID();
  const run = { conversationId, runId, sandboxId: 'test-sandbox' };
  let published = false;
  let syncedAt = '';
  let releaseApproval!: () => void;
  const pending = new Promise<void>((resolve) => {
    releaseApproval = resolve;
  });
  const diff = [
    'diff --git a/questions/example/info.json b/questions/example/info.json',
    'index 1234567..7654321 100644',
    '--- a/questions/example/info.json',
    '+++ b/questions/example/info.json',
    '@@ -1 +1 @@',
    '-{"title": "Old title"}',
    '+{"title": "Updated title"}',
    '',
  ].join('\n');
  await page.route('**/trpc/courseAgent.*', async (route) => {
    const method = new URL(route.request().url()).pathname.split('.').at(-1);
    let data: unknown;
    if (method === 'history') {
      data = {
        run,
        activeRunId: null,
        warning: null,
        messages: [
          {
            id: runId,
            role: 'assistant',
            metadata: { createdAt: new Date().toISOString() },
            parts: published
              ? [
                  { type: 'text', text: 'Published the update.' },
                  {
                    type: 'data-courseSynced',
                    data: { approvalId, commitSha: 'b'.repeat(40), syncedAt },
                  },
                ]
              : [{ type: 'text', text: 'Please review the proposed update.' }],
          },
        ],
      };
    } else if (method === 'get' || method === 'diagnostics') {
      data = {
        conversationId,
        sandboxId: run.sandboxId,
        activeRunId: null,
        status: 'waiting_for_user',
        response: null,
        error: null,
        events: [],
        messages: [],
        persistedEvents: [],
        workspaceBackup: null,
        pendingApproval: published
          ? null
          : {
              id: approvalId,
              status: 'pending',
              result: null,
              branch: 'master',
              baseSha: 'a'.repeat(40),
              proposedSha: 'b'.repeat(40),
              treeSha: 'c'.repeat(40),
              commitMessage: 'Update title',
              diffSummary: '',
              diff,
            },
      };
    } else if (method === 'list') {
      data = {
        conversations: [
          {
            id: conversationId,
            title: 'Updating the question title',
            runtime_status: 'waiting_for_user',
            last_message_at: new Date(),
            lastMessageAtLabel: 'today',
          },
        ],
      };
    } else if (method === 'getApprovalMode') {
      data = { mode: 'ask' };
    } else if (method === 'respondToPushApproval') {
      await pending;
      published = true;
      syncedAt = new Date().toISOString();
      data = { status: 'completed', published: true, message: 'Published' };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { result: { data: superjson.serialize(data) } } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  await expect(panel.getByLabel('1 additions, 1 deletions', { exact: true })).toBeVisible();
  await expect(panel.getByText('1 file changed', { exact: false })).toBeVisible();
  await expect(
    panel.getByRole('region', { name: 'Changes to questions/example/info.json' }),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('course-agent-approval-card.png') });
  await panel.getByRole('button', { name: 'Review changes', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Proposed changes' });
  const changes = review.getByRole('region', { name: 'Changes to questions/example/info.json' });
  await expect(changes.getByText('index 1234567', { exact: false })).toHaveCount(0);
  await expect(changes.getByText('+{"title": "Updated title"}', { exact: true })).toHaveCSS(
    'border-radius',
    '0px',
  );
  await expect(review.getByRole('heading', { name: 'Proposed changes' })).toBeVisible();
  await expect.poll(async () => (await review.boundingBox())!.width).toBe(1440);
  await expect(review).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: testInfo.outputPath('course-agent-approval.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await review.boundingBox())!.width).toBe(390);
  await expect(review.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('course-agent-approval-mobile.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await review
    .getByRole('navigation', { name: 'Changed files' })
    .getByRole('button', { name: 'questions/example/info.json' })
    .click();
  await review.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Publishing…', exact: true })).toBeDisabled();
  await expect(review.getByRole('button', { name: 'Deny', exact: true })).toBeDisabled();
  releaseApproval();
  await expect(review).toHaveCount(0);
  await page.reload();
  await expect(panel.getByText('Published the update.', { exact: true })).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Refresh course content', exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Conversation', exact: true })).toContainText(
    'Updating the question title',
  );
});
