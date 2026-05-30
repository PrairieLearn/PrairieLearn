import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';
import * as tmp from 'tmp-promise';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

const parseErrorCases = [
  {
    latex: String.raw`\foo`,
    message: String.raw`Unexpected LaTeX command '\foo'.`,
  },
  {
    latex: String.raw`\frac{}{2}`,
    message: 'Missing value.',
  },
  {
    latex: '(x',
    message: "Unexpected delimiter '('.",
  },
  {
    latex: 'x+',
    message: "Unexpected operator '+'.",
  },
  {
    latex: '@',
    message: "Unexpected input '@'.",
  },
] as const;

const backendErrorCases = [
  {
    name: 'MathJSON parser error nodes',
    mathJson: ['Error', { str: 'unexpected-command' }, ['LatexString', { str: String.raw`\foo` }]],
    message: String.raw`Parse error: MathJSON parse error: unexpected-command: \foo`,
  },
  {
    name: 'structured MathJSON error codes',
    mathJson: [
      'Error',
      ['ErrorCode', { str: 'unexpected-token' }, { str: '@' }],
      ['LatexString', { str: '@' }],
    ],
    message: 'Parse error: MathJSON parse error: unexpected-token: @',
  },
  {
    name: 'multiple nested MathJSON parser errors',
    mathJson: [
      'Sequence',
      [
        'InvisibleOperator',
        'x',
        ['Error', { str: 'unexpected-command' }, ['LatexString', { str: String.raw`\left` }]],
      ],
      ['Error', { str: 'unexpected-delimiter' }, ['LatexString', { str: '(' }]],
    ],
    message: String.raw`Parse error: MathJSON parse errors: unexpected-command: \left; unexpected-delimiter: (`,
  },
  {
    name: 'student-safe conversion errors',
    mathJson: ['Add', ['Set', 1], 2],
    message: 'Parse error: Expected a numeric expression.',
  },
  {
    name: 'arity conversion errors',
    mathJson: ['Power', 2],
    message: 'Parse error: Power expects exactly 2 arguments.',
  },
  {
    name: 'unexpected composition errors',
    mathJson: ['Rational', 'x'],
    message: 'Parse error: Could not parse submitted answer.',
  },
] as const;

async function createSymbolicInputQuestion(
  testCoursePath: string,
): Promise<{ cleanup: () => Promise<void>; qid: string }> {
  const questionDir = await tmp.dir({
    dir: path.join(testCoursePath, 'questions'),
    prefix: 'symbolicInputE2E',
    unsafeCleanup: true,
  });
  const questionPath = questionDir.path;
  const qid = path.basename(questionPath);

  await fs.writeFile(
    path.join(questionPath, 'info.json'),
    JSON.stringify(
      {
        uuid: randomUUID(),
        title: 'Symbolic input e2e',
        topic: 'Element',
        tags: ['e2e'],
        type: 'v3',
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(questionPath, 'question.html'),
    `
<pl-question-panel>
  <p>Enter symbolic expressions.</p>
</pl-question-panel>

<pl-symbolic-input
  aria-label="Raw symbolic expression"
  answers-name="raw"
  variables="x"
  correct-answer="x"
></pl-symbolic-input>

<pl-symbolic-input
  formula-editor="true"
  answers-name="editor"
  variables="x"
  correct-answer="x"
></pl-symbolic-input>
`,
  );
  return { cleanup: questionDir.cleanup, qid };
}

async function openSymbolicInputPreview({
  courseInstance,
  page,
  testCoursePath,
}: {
  courseInstance: CourseInstance;
  page: Page;
  testCoursePath: string;
}): Promise<() => Promise<void>> {
  const questionDir = await createSymbolicInputQuestion(testCoursePath);
  await syncCourse(testCoursePath);

  const question = await selectQuestionByQid({
    qid: questionDir.qid,
    course_id: courseInstance.course_id,
  });

  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  return async () => {
    await questionDir.cleanup();
    await syncCourse(testCoursePath);
  };
}

async function fillFormulaEditor(formulaEditor: Locator, latex: string): Promise<void> {
  await formulaEditor.evaluate((el, latex) => {
    (el as HTMLElement & { value: string }).value = latex;
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }, latex);
}

function getFormulaEditor(page: Page): Locator {
  return page.locator('#symbolic-input-editor');
}

async function setHiddenMathJson(page: Page, rawMathJson: string): Promise<void> {
  await page.locator('input[name="editor-json"]').evaluate((el, rawMathJson) => {
    (el as HTMLInputElement).value = rawMathJson;
  }, rawMathJson);
}

async function showSubmittedErrorDetails(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByText('Invalid', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'More info…' }).first().click();
}

async function submitFormulaEditorMathJson(page: Page, rawMathJson: string): Promise<void> {
  await page.getByLabel('Raw symbolic expression').fill('x');
  await fillFormulaEditor(getFormulaEditor(page), 'x');
  await setHiddenMathJson(page, rawMathJson);
  await showSubmittedErrorDetails(page);
}

test.describe('pl-symbolic-input', () => {
  test('reports and clears formula editor client-side MathJSON parse errors', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const cleanupQuestion = await openSymbolicInputPreview({
      courseInstance,
      page,
      testCoursePath,
    });

    try {
      await expect(page.locator('input[name="raw-json"]')).toHaveCount(0);
      await expect(page.locator('input[name="editor-json"]')).toHaveCount(1);

      const formulaEditor = getFormulaEditor(page);
      await expect(formulaEditor).toBeVisible();
      for (const { latex, message } of parseErrorCases) {
        await fillFormulaEditor(formulaEditor, latex);
        await expect(page.getByText(message)).toBeVisible();

        await fillFormulaEditor(formulaEditor, 'x + 1');
        await expect(page.getByText(message)).toBeHidden();
      }
    } finally {
      await cleanupQuestion();
    }
  });

  for (const { name, mathJson, message } of backendErrorCases) {
    test(`reports backend ${name} on submit`, async ({ page, testCoursePath, courseInstance }) => {
      const cleanupQuestion = await openSymbolicInputPreview({
        courseInstance,
        page,
        testCoursePath,
      });

      try {
        await submitFormulaEditorMathJson(page, JSON.stringify(mathJson));
        await expect(page.getByText(message)).toBeVisible();
      } finally {
        await cleanupQuestion();
      }
    });
  }
});
