import { randomUUID } from 'node:crypto';

import superjson from 'superjson';

import { createTest, expect } from './fixtures.js';

const test = createTest({ courseAgentRuntime: 'fake', features: { 'course-agent': true } });

test('reviews a readable diff, shows immediate approval feedback, and offers refresh', async ({
  page,
  courseInstance,
}, testInfo) => {
  const conversationId = randomUUID();
  const runId = randomUUID();
  const approvalId = randomUUID();
  const run = { conversationId, runId, sandboxId: 'test-sandbox' };
  let published = false;
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
                  { type: 'data-courseSynced', data: { approvalId } },
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
  await expect(panel.getByLabel('1 additions, 1 deletions')).toBeVisible();
  await panel.getByText('View full diff', { exact: true }).click();
  const changes = panel.getByRole('region', { name: 'Changes to questions/example/info.json' });
  await expect(changes.getByText('index 1234567', { exact: false })).toHaveCount(0);
  await expect(changes.getByText('+{"title": "Updated title"}', { exact: true })).toHaveCSS(
    'border-radius',
    '0px',
  );
  await page.screenshot({ path: testInfo.outputPath('course-agent-approval.png') });
  await panel.getByRole('button', { name: 'Expand diff', exact: true }).click();
  const review = page.getByRole('dialog');
  await expect(review.getByRole('heading', { name: 'Proposed changes' })).toBeVisible();
  await expect
    .poll(async () => (await review.boundingBox())!.width)
    .toBeGreaterThan((await panel.boundingBox())!.width);
  await review.getByRole('button', { name: 'Close', exact: true }).last().click();
  await panel.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Publishing…', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Deny', exact: true })).toBeDisabled();
  releaseApproval();
  await expect(panel.getByRole('button', { name: 'Publishing…', exact: true })).toHaveCount(0);
  await page.reload();
  await panel.getByRole('button', { name: 'Refresh course content', exact: true }).click();
  await expect(panel.getByText('Published the update.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Conversation', exact: true })).toContainText(
    'Updating the question title',
  );
});
