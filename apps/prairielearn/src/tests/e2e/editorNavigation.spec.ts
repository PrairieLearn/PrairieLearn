import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

test.beforeEach(async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'editorNavigation',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
});

test('file editor guidance follows the active key bindings', async ({ page }) => {
  const editor = page.getByRole('group', { name: 'answer.py', exact: true });

  await page.getByRole('button', { name: 'Editor settings', exact: true }).click();
  await page.getByLabel('Key Bindings').selectOption('ace/keyboard/vim');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText(/To leave, press Esc to return to Vim Normal mode/)).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  await editor.focus();
  await page.keyboard.press('Enter');
  const input = page.getByRole('textbox', { name: /answer.py, Cursor/ });
  await expect(input).toHaveAccessibleDescription(/return to Vim Normal mode/);

  await page.getByRole('button', { name: 'Editor settings', exact: true }).click();
  await page.getByLabel('Key Bindings').selectOption('ace/keyboard/default');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(input).toHaveAccessibleDescription('Press Esc, then Tab to leave the editor.');
});

test('rich text code blocks allow leaving in either direction without editing', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.focus();
  await page.keyboard.press('End');
  const originalText = await editor.innerText();
  await page.keyboard.press('Tab');
  await expect(editor).toBeFocused();
  const indentedText = await editor.innerText();
  expect(indentedText).not.toBe(originalText);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'After rich text editor' })).toBeFocused();
  await expect(editor).toHaveText(indentedText);

  await page.keyboard.press('Shift+Tab');
  await expect(editor).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Remove formatting', exact: true })).toBeFocused();
  await expect(editor).toHaveText(indentedText);
});
