import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

test('rich text code blocks allow leaving in either direction without editing', async ({
  page,
  courseInstance,
}) => {
  const question = await selectQuestionByQid({
    qid: 'editorNavigation',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.focus();
  const originalText = await editor.innerText();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'After rich text editor' })).toBeFocused();
  await expect(editor).toHaveText(originalText);

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Remove formatting', exact: true })).toBeFocused();
  await expect(editor).toHaveText(originalText);
});
