import fs from 'node:fs/promises';
import path from 'node:path';

import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

test('math fields do not show the hamburger menu', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const qid = 'bigOperatorInputE2e';
  const questionPath = path.join(testCoursePath, 'questions', qid);
  await fs.mkdir(questionPath, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(questionPath, 'info.json'),
      JSON.stringify({
        uuid: 'd48f5055-773f-4f82-9953-a32147bb05df',
        title: 'Big operator input E2E test',
        topic: 'Element',
        tags: [],
        type: 'v3',
      }),
    ),
    fs.writeFile(
      path.join(questionPath, 'question.html'),
      `<pl-big-operator-input
        answers-name="sum"
        correct-answer="Sum(k, (k, 1, n))"
        variables="n"
      ></pl-big-operator-input>`,
    ),
  ]);
  await syncCourse(testCoursePath);

  const question = await selectQuestionByQid({ qid, course_id: courseInstance.course_id });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const mathFields = page.locator('math-field');
  await expect(mathFields.first()).toBeVisible();
  for (const mathField of await mathFields.all()) {
    await expect(mathField.locator('[part="menu-toggle"]')).toBeHidden();
  }
});
