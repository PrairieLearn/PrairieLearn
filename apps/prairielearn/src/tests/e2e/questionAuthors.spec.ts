import fs from 'node:fs/promises';
import path from 'node:path';

import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

test('edits authors with keyboard entry, cancellation, and persistence', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: courseInstance.course_id,
  });
  const url = `/pl/course/${courseInstance.course_id}/question/${question.id}/settings`;
  const infoPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');
  const originalInfo = await fs.readFile(infoPath, 'utf8');
  const original = JSON.parse(originalInfo);
  try {
    await page.goto(url);
    const input = page.getByRole('combobox', { name: 'Authors', exact: true });
    await input.fill('  keyboard-author  ');
    await input.press('Enter');
    const keyboardChip = page.getByRole('button', { name: 'Remove keyboard-author', exact: true });
    await expect(keyboardChip).toBeVisible();
    await input.fill('comma-author');
    await input.press(',');
    await expect(
      page.getByRole('button', { name: 'Remove comma-author', exact: true }),
    ).toBeVisible();
    expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).toEqual(original.authors);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(keyboardChip).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Remove comma-author', exact: true }),
    ).toHaveCount(0);

    for (const uid of original.authors) {
      await page.getByRole('button', { name: `Remove ${uid}`, exact: true }).click();
    }
    await input.fill('saved-author');
    await input.press('Enter');
    const myself = page.getByRole('button', { name: 'Add myself', exact: true });
    await myself.click();
    await expect(myself).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForLoadState('load');
    await expect(
      page.getByRole('button', { name: 'Remove saved-author', exact: true }),
    ).toBeVisible();
    expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).toEqual([
      'saved-author',
      'dev@example.com',
    ]);
  } finally {
    await fs.writeFile(infoPath, originalInfo);
    await syncCourse(testCoursePath);
  }
});
