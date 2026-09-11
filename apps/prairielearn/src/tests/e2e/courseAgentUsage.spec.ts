import { randomUUID } from 'node:crypto';

import superjson from 'superjson';

import { createTest, expect } from './fixtures.js';

const test = createTest({ courseAgentRuntime: 'fake', features: { 'course-agent': true } });

test('shows recorded per-run and conversation usage without paid requests', async ({
  page,
  courseInstance,
}, testInfo) => {
  const run = { conversationId: randomUUID(), runId: randomUUID(), sandboxId: 'usage-test' };
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
            id: run.runId,
            role: 'assistant',
            parts: [{ type: 'text', text: 'Usage test complete.', state: 'done' }],
          },
        ],
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
        runUsages: [
          {
            run_id: run.runId,
            normalized_total_tokens: 1200,
            estimated_cost_milli_dollars: 15.75,
            finalized_at: new Date(),
          },
        ],
      };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { result: { data: superjson.serialize(data) } } });
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  await expect(panel.getByText('Usage test complete.')).toBeVisible();
  await panel
    .getByText('Conversation info (only visible to administrators)', { exact: true })
    .click();
  await expect(
    panel.getByText('Conversation: 1,200 tokens · $0.0158 estimated', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText('Run: 1,200 tokens · $0.0158 estimated · Finalized', { exact: true }),
  ).toBeVisible();
  await panel
    .getByText('Run: 1,200 tokens · $0.0158 estimated · Finalized', { exact: true })
    .scrollIntoViewIfNeeded();
  await panel.screenshot({ path: testInfo.outputPath('course-agent-usage.png') });
});
