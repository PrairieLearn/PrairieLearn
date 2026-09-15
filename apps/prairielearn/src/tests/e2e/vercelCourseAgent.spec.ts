import { updateCourseColumn } from '../../models/course.js';
import { selectUserByUid } from '../../models/user.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ isEnterprise: true, features: { 'vercel-course-agent': true } });

test('course agent streams replies, starts over, and collapses on desktop and mobile', async ({
  page,
  courseInstance,
}, testInfo) => {
  // Exercise the real PL authorization and conversation creation, without paid sandbox/model calls.
  await page.route('**/vercel_course_agent', async (route) => {
    await route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body:
        [
          { type: 'start', messageId: 'reply' },
          { type: 'text-start', id: 'text' },
          {
            type: 'text-delta',
            id: 'text',
            delta: 'Created README.md in the temporary workspace.',
          },
          { type: 'text-end', id: 'text' },
          { type: 'finish' },
        ]
          .map((part) => `data: ${JSON.stringify(part)}\n\n`)
          .join('') + 'data: [DONE]\n\n',
    });
  });
  const user = await selectUserByUid('dev@example.com');
  await updateCourseColumn({
    courseId: courseInstance.course_id,
    columnName: 'repository',
    value: 'https://github.com/example/course.git',
    authnUserId: user.id,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/questions`);
  await expect(page.getByRole('complementary', { name: 'Course agent panel' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message course agent' }).fill('Create a README');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Created README.md in the temporary workspace.')).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('course-agent-desktop.png'),
  });
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByText('What would you like to build?')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse course agent' }).click();
  await page.getByRole('button', { name: 'Expand course agent' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('textbox', { name: 'Message course agent' })).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('course-agent-mobile.png'),
  });
  await page.getByRole('button', { name: 'Close course agent' }).click();
  await expect(page.getByRole('button', { name: 'Expand course agent' })).toBeVisible();
});
