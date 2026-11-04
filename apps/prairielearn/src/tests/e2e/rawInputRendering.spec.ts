import type { Page } from '@playwright/test';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

async function openRawInputRenderingQuestion(page: Page, courseInstance: CourseInstance) {
  const question = await selectQuestionByQid({
    qid: 'rawInputRendering',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
}

test('restores literal matrix input after grading', async ({ page, courseInstance }) => {
  await openRawInputRenderingQuestion(page, courseInstance);

  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByRole('textbox', { name: 'Matrix value' })).toHaveValue('[1,\u200b 2]');
});
