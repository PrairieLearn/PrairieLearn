import type { Page } from '@playwright/test';
import axe from 'axe-core';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import type { CourseInstance } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getConfiguredUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForPrintablePage } from './utils/printing.js';

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

async function makePrintableAssessmentInstance(
  courseInstance: CourseInstance,
  tid: string,
): Promise<string> {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid,
  });
  return await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
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
    const assessmentInstanceId = await makePrintableAssessmentInstance(
      courseInstance,
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

test('renders readable answer keys for every student question', async ({
  page,
  courseInstance,
}) => {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
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
