import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { selectUserByUid } from '../../models/user.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ isEnterprise: true, features: { 'ai-question-generation': true } });

test('uses the shared chat without changing question-editor controls', async ({
  page,
  courseInstance,
}, testInfo) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/questions`);
  const user = await selectUserByUid('dev@example.com');
  const result = await getCourseFilesClient().createQuestion.mutate({
    course_id: courseInstance.course_id,
    user_id: user.id,
    authn_user_id: user.id,
    has_course_permission_edit: true,
    is_draft: true,
    files: { 'question.html': '<pl-question-panel>A test question.</pl-question-panel>' },
  });
  if (result.status !== 'success') throw new Error('Failed to create the test draft');
  await page.route('**/chat', async (route) => {
    const events = [
      { type: 'start', messageId: 'test-assistant' },
      { type: 'reasoning-start', id: 'reasoning-1' },
      { type: 'reasoning-delta', id: 'reasoning-1', delta: 'Checked the requested changes.' },
      { type: 'reasoning-end', id: 'reasoning-1' },
      {
        type: 'tool-input-available',
        toolCallId: 'tool-1',
        toolName: 'readFile',
        input: { path: 'question.html' },
      },
      { type: 'tool-output-available', toolCallId: 'tool-1', output: 'Question HTML' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Reviewed `question.html`.' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish' },
    ];
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      body:
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  await page.goto(
    `/pl/course/${courseInstance.course_id}/ai_generate_editor/${result.question_id}`,
  );
  const input = page.getByRole('textbox', { name: 'Modification instructions' });
  await expect(
    page.getByRole('checkbox', { name: 'Refresh question preview after changes' }),
  ).toBeVisible();
  await input.fill('Review this question');
  await input.press('Enter');
  const reply = page.getByRole('article', { name: 'Message from PrairieLearn' });
  await expect(reply.getByText('Reviewed', { exact: false })).toBeVisible();
  await expect(reply.getByText('Read file', { exact: false })).toBeVisible();
  const thinking = reply.getByRole('button', { name: 'Thinking', exact: true });
  await expect(thinking).toHaveAttribute('aria-expanded', 'false');
  await thinking.click();
  await expect(reply.getByText('Checked the requested changes.', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Message from Dev User' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('question-chat.png') });
});
