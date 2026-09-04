import { updateCourseColumn } from '../../models/course.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ courseAgentRuntime: 'fake', features: { 'course-agent': true } });

test('sends with Enter and keeps formatted responses and activity within each turn', async ({
  page,
  courseInstance,
}) => {
  await updateCourseColumn({
    courseId: courseInstance.course_id,
    columnName: 'repository',
    value: 'https://github.com/PrairieLearn/test.git',
    authnUserId: (await getConfiguredUser()).id,
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const input = panel.getByRole('textbox', { name: 'Message course agent' });

  await expect(panel.getByRole('switch')).toHaveCount(0);
  await expect(panel.getByText('Live conversation state', { exact: true })).toBeVisible();
  await input.fill('First `inline`');
  await input.press('Enter');
  await expect(panel.getByRole('article', { name: 'Message from PrairieLearn' })).toHaveCount(1);
  await expect(
    panel
      .getByRole('article', { name: 'Message from PrairieLearn' })
      .getByText('inline', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Made 1 tool call' })).toHaveCount(1);

  await input.fill('Second');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('Second\n');
  await input.press('Enter');
  await expect(panel.getByRole('article', { name: 'Message from you' })).toHaveCount(2);
  await expect(panel.getByRole('button', { name: 'Made 1 tool call' })).toHaveCount(2);
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Made 1 tool call' }).first()).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(panel.getByRole('button', { name: 'Made 1 tool call' }).last()).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await panel.getByRole('button', { name: 'Made 1 tool call' }).first().click();
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(1);
  await expect(panel.getByText('Started agent', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Made 1 tool call' }).first().click();
  await expect(panel.getByText('Started agent', { exact: true })).toBeHidden();
  await panel.getByText('Live conversation state', { exact: true }).click();
  await expect(panel.getByText('Token usage', { exact: true })).toBeVisible();
  await expect(panel.getByText('Ready', { exact: true })).toBeVisible();

  await page.reload();
  await expect(panel.getByRole('article', { name: 'Message from you' })).toHaveCount(2);
  await expect(panel.getByRole('article', { name: 'Message from PrairieLearn' })).toHaveCount(2);
  await expect(panel.getByRole('button', { name: 'Made 1 tool call' })).toHaveCount(2);
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Made 1 tool call' }).first().click();
  await expect(panel.getByText('Edited README.md', { exact: true })).toHaveCount(1);
});

test('reserves desktop space for the panel and fills the mobile viewport', async ({
  page,
  courseInstance,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const content = page.getByRole('main');
  const panelBox = await panel.boundingBox();
  const contentBox = await content.boundingBox();
  expect(contentBox!.x + contentBox!.width).toBeLessThanOrEqual(panelBox!.x);
  expect(contentBox!.width).toBeGreaterThan(480);

  await panel.getByRole('button', { name: 'Collapse course agent' }).click();
  await expect(panel.getByRole('button', { name: 'Expand course agent' })).toBeVisible();
  await panel.getByRole('button', { name: 'Expand course agent' }).click();

  await page.setViewportSize({ width: 1000, height: 900 });
  expect(await panel.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1000, height: 900 });
  await panel.getByRole('button', { name: 'Close course agent' }).click();
  expect((await content.boundingBox())!.width).toBeGreaterThan(600);
  await panel.getByRole('button', { name: 'Expand course agent' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  const mobileBox = await panel.boundingBox();
  expect(mobileBox).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await expect(panel.getByRole('button', { name: 'Close course agent' })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Message course agent' })).toBeVisible();
});
