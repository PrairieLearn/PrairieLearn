import fs from 'node:fs/promises';
import path from 'node:path';

import { selectCourseByShortName } from '../../models/course.js';
import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

test.setTimeout(60_000);

for (const { label, latex, plainText } of [
  { label: 'empty-set symbol', latex: '\\emptyset', plainText: 'O/' },
  { label: 'empty braces', latex: '\\{\\}', plainText: '{}' },
]) {
  test(`formula editor preserves a single empty set submitted as ${label}`, async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const qid = 'symbolicInputEmptySet';
    const questionPath = path.join(testCoursePath, 'questions', qid);
    await fs.mkdir(questionPath, { recursive: true });
    await fs.writeFile(
      path.join(questionPath, 'info.json'),
      JSON.stringify({
        uuid: 'd98429d6-791d-4dbc-b9c0-9d1219ba4783',
        title: 'Symbolic input empty set',
        topic: 'Algebra',
        tags: [],
        type: 'v3',
      }),
    );
    await fs.writeFile(
      path.join(questionPath, 'question.html'),
      `<pl-symbolic-input
      answers-name="answer"
      allow-sets="true"
      formula-editor="true"
      correct-answer="0"
    ></pl-symbolic-input>`,
    );
    await syncCourse(testCoursePath);

    const course = await selectCourseByShortName('QA 101');
    const question = await selectQuestionByQid({ qid, course_id: course.id });
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
    );

    const mathField = page.locator('math-field').first();
    await mathField.evaluate((element, value) => {
      const field = element as HTMLElement & { value: string };
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }, latex);

    await expect(page.locator('input[name="answer"]')).toHaveValue(plainText);
    const submittedLatex = await page.locator('input[name="answer-latex"]').inputValue();

    await page.getByRole('button', { name: /Save & Grade/ }).click();

    await expect(mathField).toBeVisible();
    await expect
      .poll(() =>
        mathField.evaluate((element) =>
          (element as HTMLElement & { getValue(format: string): string }).getValue('latex'),
        ),
      )
      .toBe(submittedLatex);
    await expect(page.locator('input[name="answer-latex"]')).toHaveValue(submittedLatex);
  });
}
