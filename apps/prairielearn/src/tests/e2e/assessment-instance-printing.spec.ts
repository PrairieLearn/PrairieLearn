import type { Page } from '@playwright/test';
import axe from 'axe-core';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import type { CourseInstance } from '../../lib/db-types.js';
import { selectVariantsByInstanceQuestion } from '../../models/variant.js';

import { createTest, expect } from './fixtures.js';
import { createPrintableAssessmentInstance, waitForPrintablePage } from './utils/printing.js';

const test = createTest({ features: { 'printable-exams': true } });

const sql = loadSqlEquiv(import.meta.url);

// Rendering a preview and an export can exceed Playwright's default 30-second test timeout.
test.describe.configure({ timeout: 180_000 });

interface PaginatedQuestionLayout {
  pageCount: number;
  questionPages: Record<string, number[]>;
}

interface AnswerKeyQuestionPresentation {
  answerRegionCount: number;
  gradingBlockCount: number;
  questionNumber: string | undefined;
  visibleStudentResponseCount: number;
}

function paperUrl(courseInstance: CourseInstance, assessmentInstanceId: string): string {
  return `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}/paper/preview?paper_size=Letter`;
}

async function readPaginatedQuestionLayout(page: Page): Promise<PaginatedQuestionLayout> {
  await waitForPrintablePage(page);

  return await page.locator('.pagedjs_page').evaluateAll((pages) => {
    const questionPages: Record<string, number[]> = {};
    for (const [pageIndex, page] of pages.entries()) {
      for (const question of page.querySelectorAll<HTMLElement>('.printing-question')) {
        const questionNumber = question.dataset.questionNumber;
        if (!questionNumber) continue;
        (questionPages[questionNumber] ??= []).push(pageIndex + 1);
      }
    }
    return { pageCount: pages.length, questionPages };
  });
}

async function readAnswerKeyQuestionPresentations(
  page: Page,
): Promise<AnswerKeyQuestionPresentation[]> {
  return await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions): AnswerKeyQuestionPresentation[] => {
      return questions.map((question) => {
        const visibleStudentResponseCount = [
          ...question.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]), textarea, select, math-field, [data-print-response-line], [data-print-response-area], .printing-choice-list',
          ),
        ].filter(
          (response) =>
            !response.closest('[data-print-answer-key]') && response.getClientRects().length > 0,
        ).length;

        return {
          answerRegionCount: question.querySelectorAll('[data-print-answer-key]').length,
          gradingBlockCount: question.querySelectorAll('.grading-block').length,
          questionNumber: question.dataset.questionNumber,
          visibleStudentResponseCount,
        };
      });
    });
}

for (const document of ['exam', 'answer_key'] as const) {
  test(`renders an accessible ${document} preview`, async ({ page, courseInstance }) => {
    await page.context().addInitScript({ content: axe.source });
    const assessmentInstanceId = await createPrintableAssessmentInstance(
      courseInstance.id,
      'exam20-assessmentTools',
    );
    const response = await page.goto(
      `${paperUrl(courseInstance, assessmentInstanceId)}&document=${document}`,
    );
    await readPaginatedQuestionLayout(page);
    await expect(page.getByText('Consider two numbers', { exact: false })).toBeVisible();
    await expect(page.locator('script:not([type="application/json"])')).toHaveCount(0);
    expect(response?.headers()['content-security-policy']).toContain("script-src 'none'");
    const { violations } = await page.evaluate(async () => await axe.run());
    expect(violations).toEqual([]);
  });
}

test('reuses closed homework variants for student copies and answer keys', async ({
  page,
  courseInstance,
}) => {
  const assessmentInstanceId = await createPrintableAssessmentInstance(
    courseInstance.id,
    'hw20-afterCompleteVisibility',
  );
  const url = paperUrl(courseInstance, assessmentInstanceId);
  await page.goto(url);
  await readPaginatedQuestionLayout(page);
  await expect(page.locator(':root')).toHaveAttribute('data-print-warnings', '[]');
  const variants = await selectVariantsByInstanceQuestion({
    assessment_instance_id: assessmentInstanceId,
  });
  expect(variants).toHaveLength(1);
  await execute(sql.close_variants, { assessment_instance_id: assessmentInstanceId });

  for (const document of ['exam', 'answer_key', 'exam']) {
    await page.goto(`${url}&document=${document}`);
    const layout = await readPaginatedQuestionLayout(page);
    expect(Object.keys(layout.questionPages)).toHaveLength(1);
    await expect(page.locator(':root')).toHaveAttribute('data-print-question-count', '1');
    await expect(page.locator(':root')).toHaveAttribute('data-print-omitted-question-count', '0');
    expect(
      await selectVariantsByInstanceQuestion({ assessment_instance_id: assessmentInstanceId }),
    ).toEqual(variants.map((variant) => ({ ...variant, open: false })));
  }
});

test('renders readable answer keys for every student question', async ({
  page,
  courseInstance,
}) => {
  const assessmentInstanceId = await createPrintableAssessmentInstance(
    courseInstance.id,
    'exam20-assessmentTools',
  );
  const endpoint = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${assessmentInstanceId}/paper/preview?paper_size=Letter&identity_field=Section&identity_field=Student%20ID`;

  await page.goto(endpoint);
  const examLayout = await readPaginatedQuestionLayout(page);
  expect(Object.keys(examLayout.questionPages).length).toBeGreaterThan(1);
  const coverPage = page.locator('.pagedjs_page').first();
  await expect(coverPage.getByText('Name', { exact: true })).toBeVisible();
  await expect(coverPage.getByText('Section', { exact: true })).toBeVisible();
  await expect(coverPage.getByText('Student ID', { exact: true })).toBeVisible();
  await expect(coverPage.getByText('Date', { exact: true })).toBeVisible();

  await page.goto(`${endpoint}&document=answer_key`);
  const answerKeyLayout = await readPaginatedQuestionLayout(page);

  expect(Object.keys(answerKeyLayout.questionPages)).toEqual(Object.keys(examLayout.questionPages));
  const answerContents = await page
    .locator('.printing-answer-key-content')
    .evaluateAll((contents) =>
      contents.map((content) => ({
        transform: getComputedStyle(content).transform,
        fontSize: Number.parseFloat(getComputedStyle(content).fontSize),
        clippedHorizontally: content.scrollWidth > content.clientWidth + 1,
      })),
    );
  for (const content of answerContents) {
    expect(content.transform).toBe('none');
    expect(content.fontSize).toBeGreaterThanOrEqual(12);
    expect(content.clippedHorizontally).toBe(false);
  }

  const presentations = await readAnswerKeyQuestionPresentations(page);
  expect(presentations).toHaveLength(Object.keys(examLayout.questionPages).length);
  for (const presentation of presentations) {
    expect(presentation).toMatchObject({
      answerRegionCount: 1,
      gradingBlockCount: 0,
      visibleStudentResponseCount: 0,
    });
    expect(presentation.questionNumber).toBeTruthy();
  }
});
