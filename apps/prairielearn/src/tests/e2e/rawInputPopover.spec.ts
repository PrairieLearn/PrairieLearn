import fs from 'node:fs/promises';
import path from 'node:path';

import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

test('shows safe raw input diagnostics for scalar and matrix inputs', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const qid = 'rawInputPopover';
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
        <pl-string-input answers-name="text" correct-answer="expected" label="Text:"></pl-string-input>
        <pl-matrix-component-input answers-name="matrix" label="Matrix:"></pl-matrix-component-input>
      `,
    ),
    fs.writeFile(
      path.join(questionDir, 'server.py'),
      `
def generate(data):
    data["correct_answers"]["matrix"] = [[1, 2]]
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
  await page.getByRole('textbox', { name: 'Row 1, Column 1' }).fill('1\u200b');
  await page.getByRole('textbox', { name: 'Row 1, Column 2' }).fill('2');
  await page.getByRole('button', { name: /Save & Grade/ }).click();

  const buttons = page.getByRole('button', { name: 'Original input' });
  await expect(buttons).toHaveCount(2);

  await buttons.first().click();
  let popover = page.getByRole('tooltip').filter({ hasText: 'café<U+200b>' });
  await expect(popover).toHaveClass(/popover-wide/);
  await expect(popover).toHaveClass(/popover-scrollable/);
  await expect(popover).toContainText('café<U+200b><img src=x>');
  await expect(popover.locator('img')).toHaveCount(0);
  await popover.getByText('Show all non-ASCII characters').click();
  await expect(popover).toContainText('caf<U+e9><U+200b><img src=x>');

  await buttons.nth(1).click();
  popover = page.getByRole('tooltip').filter({ has: page.locator('table') });
  await expect(popover.locator('table')).toHaveCount(2);
  await expect(popover.locator('table').first().locator('tr')).toHaveCount(1);
  await expect(popover.locator('table').first().locator('td')).toHaveCount(2);
  await expect(popover.locator('table').first()).toContainText('1<U+200b>');
  await popover.getByText('Show all non-ASCII characters').click();
  await expect(popover.locator('table').nth(1)).toContainText('1<U+200b>');
});
