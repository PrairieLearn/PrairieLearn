import fs from 'node:fs/promises';
import path from 'node:path';

import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

test('shows safe raw input diagnostics for scalar inputs', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const qid = 'rawInputPopoverScalar';
  const questionDir = path.join(testCoursePath, 'questions', qid);
  await fs.mkdir(questionDir, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(questionDir, 'info.json'),
      JSON.stringify({
        uuid: '6c4f677e-d32a-4533-b91a-cb348f143f4f',
        title: 'Raw input popover',
        topic: 'Test',
        tags: ['v3'],
        type: 'v3',
      }),
    ),
    fs.writeFile(
      path.join(questionDir, 'question.html'),
      `
        <pl-string-input answers-name="text" correct-answer="expected" label="Text:" aria-label="Text answer"></pl-string-input>
      `,
    ),
  ]);
  await syncCourse(testCoursePath);

  const question = await selectQuestionByQid({
    qid,
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  await page.locator('input[name="text"]').fill('café\u200b<img src=x>');
  await page.getByRole('button', { name: /Save & Grade/ }).click();

  const button = page.getByRole('button', { name: 'Original input for Text answer' });
  await button.click();
  const popover = page.getByRole('tooltip').filter({ hasText: 'café<U+200b>' });
  await expect(popover).toHaveClass(/popover-wide/);
  await expect(popover).toHaveClass(/popover-scrollable/);
  await expect(popover).toContainText('café<U+200b><img src=x>');
  await expect(popover.locator('img')).toHaveCount(0);
  await popover.getByText('Show all non-ASCII characters').click();
  await expect(popover).toContainText('caf<U+e9><U+200b><img src=x>');
});
