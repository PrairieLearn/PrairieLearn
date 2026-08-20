import { createTest, expect } from './fixtures.js';

const agentWorkerUrl = process.env.AGENT_WORKER_URL;
const test = createTest({
  agentCapabilitySecret: 'local-agent-capability-secret-32-bytes',
  agentHarness: 'deterministic',
  agentWorkerUrl: agentWorkerUrl ?? 'http://localhost:1',
  features: {
    'cloud-agent': true,
    'cloud-agent-arbitrary-sql': true,
  },
});

test.skip(agentWorkerUrl === undefined, 'Requires the local Wrangler agent Worker.');

test('creates, resumes, publishes, and deletes a durable agent conversation', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(240_000);
  await page.goto(`/pl/course_instance/${courseInstance.id}/instructor/course_admin/agents`);
  await expect(page).toHaveTitle(/Course agent/);

  await page.getByRole('button', { name: 'New' }).click();
  const message = page.getByLabel('Message');
  await message.fill('Inspect the course and make a deterministic question edit.');
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(
    page
      .getByText(
        'Deterministic response for: Inspect the course and make a deterministic question edit.',
        { exact: true },
      )
      .first(),
  ).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  const previews = page.getByRole('region', { name: 'Rendered question preview' });
  await expect(previews).toHaveCount(1);
  await expect(previews.first().getByTitle('Rendered PrairieLearn question')).toBeVisible();
  await expect(previews.first()).toContainText('Variant seed: 1');

  await message.fill('Resume the same durable session and make one more edit.');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(
    page
      .getByText(
        'Deterministic response for: Resume the same durable session and make one more edit.',
        { exact: true },
      )
      .first(),
  ).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  await expect(previews).toHaveCount(2);

  const toolResults = page.getByText('Tool result', { exact: true });
  const toolResultCount = await toolResults.count();
  await page.getByRole('button', { name: 'Create draft pull request' }).click();
  await expect(toolResults).toHaveCount(toolResultCount + 1, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete conversation?' });
  await dialog.getByRole('button', { name: 'Delete conversation' }).click();
  await expect(
    page.getByText('Create a conversation to begin working with the course agent.'),
  ).toBeVisible();
});
