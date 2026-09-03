import { createTest, expect } from './fixtures.js';

const test = createTest({ courseAgentRuntime: 'fake', features: { 'course-agent': true } });

test('sends with Enter and keeps formatted responses and activity within each turn', async ({
  page,
  courseInstance,
}) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/instances`);
  const panel = page.getByRole('complementary', { name: 'Course agent panel' });
  const input = panel.getByRole('textbox', { name: 'Message course agent' });

  await expect(panel.getByRole('switch')).toHaveCount(0);
  await expect(panel.getByText('Conversation diagnostics', { exact: true })).toBeVisible();
  await input.fill('First `inline`');
  await input.press('Enter');
  await expect(panel.getByRole('article', { name: 'Message from PrairieLearn' })).toHaveCount(1);
  await expect(
    panel
      .getByRole('article', { name: 'Message from PrairieLearn' })
      .getByText('inline', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: /Worked for \d+s/ })).toHaveCount(1);

  await input.fill('Second');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('Second\n');
  await input.press('Enter');
  await expect(panel.getByRole('article', { name: 'Message from you' })).toHaveCount(2);
  await expect(panel.getByRole('button', { name: /Worked for \d+s/ })).toHaveCount(2);
  await expect(panel.getByText('Edited README.md', { exact: true }).first()).toBeHidden();
  await expect(panel.getByRole('button', { name: /Worked for \d+s/ }).first()).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(panel.getByRole('button', { name: /Worked for \d+s/ }).last()).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await panel
    .getByRole('button', { name: /Worked for \d+s/ })
    .first()
    .click();
  await expect(panel.getByText('Edited README.md', { exact: true }).first()).toBeVisible();
  await expect(panel.getByText('Edited README.md', { exact: true }).last()).toBeHidden();
  await expect(panel.getByText('Set up course', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Started agent', { exact: true })).toBeVisible();
  await panel
    .getByRole('button', { name: /Worked for \d+s/ })
    .first()
    .click();
  await expect(panel.getByText('Started agent', { exact: true })).toBeHidden();
  await panel.getByText('Conversation diagnostics', { exact: true }).click();
  await expect(panel.getByText('Token usage', { exact: true })).toBeVisible();
  await expect(panel.getByText('Status: Ready', { exact: true })).toBeVisible();
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
  expect(panelBox!.width).toBeLessThan(481);
  const collapseBox = await panel
    .getByRole('button', { name: 'Collapse course agent' })
    .boundingBox();
  expect(collapseBox!.x - panelBox!.x).toBeLessThan(40);
  await expect(panel.getByText('QA 101', { exact: true })).toHaveCount(0);

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
  await expect(panel.getByRole('button', { name: /Worked for \d+s/ })).toHaveCount(1);
  await transcript.hover();
  await page.mouse.wheel(0, -10000);
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBeLessThan(100);
  await input.fill('Latest message');
  await input.press('Enter');
  await expect(panel.getByRole('button', { name: /Worked for \d+s/ })).toHaveCount(2);
  await expect
    .poll(() =>
      transcript.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThan(5);
});
