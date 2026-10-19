import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ isEnterprise: true });

test('the rich text visibility menu opens from the keyboard and changes the selected panel', async ({
  page,
  courseInstance,
  testCoursePath,
  enableFeatureFlag,
}) => {
  await enableFeatureFlag('ai-question-generation');
  await enableFeatureFlag('rich-text-editor');

  const qid = '__drafts__/popover-accessibility';
  const questionPath = path.join(testCoursePath, 'questions', qid);
  await fs.mkdir(questionPath, { recursive: true });
  await fs.writeFile(
    path.join(questionPath, 'info.json'),
    JSON.stringify({
      uuid: randomUUID(),
      title: 'Popover accessibility',
      topic: 'Algebra',
      type: 'v3',
    }),
  );
  await fs.writeFile(
    path.join(questionPath, 'question.html'),
    [
      '<pl-question-panel><p>First block</p></pl-question-panel>',
      '<pl-question-panel><p>Second block</p></pl-question-panel>',
    ].join(''),
  );
  await syncCourse(testCoursePath);

  const question = await selectQuestionByQid({ qid, course_id: courseInstance.course_id });
  await page.goto(`/pl/course/${courseInstance.course_id}/ai_generate_editor/${question.id}`);
  await page.getByRole('tab', { name: 'Rich text editor' }).click();

  const editor = page.getByLabel('Main content area, start typing to enter text.');
  const panelFor = (text: string) =>
    editor.locator('[data-node-view-wrapper]').filter({ hasText: text });
  const firstPanel = panelFor('First block');
  const secondPanel = panelFor('Second block');
  const trigger = page.getByRole('button', { name: 'Panel visibility', exact: true });

  await expect(firstPanel.getByRole('img', { name: 'Question Panel' })).toBeVisible();
  await expect(secondPanel.getByRole('img', { name: 'Question Panel' })).toBeVisible();
  await editor.focus();
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Visibility' });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await editor.getByText('Second block', { exact: true }).click();
  await trigger.click();
  await dialog.getByRole('button', { name: 'In answer' }).click();
  await expect(firstPanel.getByRole('img', { name: 'Question Panel' })).toBeVisible();
  await expect(secondPanel.getByRole('img', { name: 'Answer Panel' })).toBeVisible();
  await expect(dialog).toBeHidden();

  await trigger.click();
  await expect(dialog.getByRole('button', { name: 'In question' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(dialog.getByRole('button', { name: 'In answer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByRole('button', { name: 'In submission' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(dialog.getByRole('button', { name: 'Always' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await dialog.getByRole('button', { name: 'Always' }).click();
  await expect(dialog).toBeHidden();
  await expect(editor.getByText('Second block', { exact: true })).toBeVisible();
  await trigger.click();
  await expect(dialog.getByRole('button', { name: 'Always' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
