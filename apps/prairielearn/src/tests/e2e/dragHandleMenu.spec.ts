import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ isEnterprise: true });

test('the rich text visibility menu opens from the keyboard', async ({
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
    '<pl-question-panel><p>Question text</p></pl-question-panel>',
  );
  await syncCourse(testCoursePath);

  const question = await selectQuestionByQid({ qid, course_id: courseInstance.course_id });
  await page.goto(`/pl/course/${courseInstance.course_id}/ai_generate_editor/${question.id}`);
  await page.getByRole('tab', { name: 'Rich text editor' }).click();

  const trigger = page.getByRole('button', { name: 'Panel visibility', exact: true });
  await page.getByLabel('Main content area, start typing to enter text.').focus();
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Visibility' });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.press('Enter');
  await dialog.getByRole('button', { name: 'In answer' }).click();
  await expect(page.getByRole('img', { name: 'Answer Panel' })).toBeVisible();
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
  await trigger.click();
  await expect(dialog.getByRole('button', { name: 'Always' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
