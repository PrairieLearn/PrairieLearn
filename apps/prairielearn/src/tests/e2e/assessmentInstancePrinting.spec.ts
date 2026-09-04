import type { Page } from '@playwright/test';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import type { CourseInstance } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getConfiguredUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

interface PaginatedQuestionLayout {
  pageCount: number;
  questionPages: Record<string, number[]>;
}

interface AnswerKeyQuestionPresentation {
  answerRegionCount: number;
  gradingBlockCount: number;
  placement: string | undefined;
  questionNumber: string | undefined;
  studentHeight: string | undefined;
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
  await page.evaluate(async () => {
    await (window as typeof window & { __PL_PRINT_READY__: Promise<{ totalPages: number }> })
      .__PL_PRINT_READY__;
  });
  await expect(page.locator('html').first()).toHaveAttribute('data-print-status', 'ready');

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
            'input:not([type="hidden"]), textarea, select, math-field, [data-print-response-area], .printing-choice-list',
          ),
        ].filter(
          (response) =>
            !response.closest('[data-print-answer-key]') && response.getClientRects().length > 0,
        ).length;

        return {
          answerRegionCount: question.querySelectorAll('[data-print-answer-key]').length,
          gradingBlockCount: question.querySelectorAll('.grading-block').length,
          placement: question.dataset.printAnswerKeyPlacement,
          questionNumber: question.dataset.questionNumber,
          studentHeight: question.dataset.printStudentHeight,
          visibleStudentResponseCount,
        };
      });
    });
}

test('keeps answer-key questions on the same pages as the student exam', async ({
  page,
  courseInstance,
}) => {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam1-automaticTestSuite',
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

  expect(answerKeyLayout).toEqual(examLayout);

  const presentations = await readAnswerKeyQuestionPresentations(page);
  expect(presentations).toHaveLength(Object.keys(examLayout.questionPages).length);
  for (const presentation of presentations) {
    expect(presentation).toMatchObject({
      answerRegionCount: 1,
      gradingBlockCount: 0,
      visibleStudentResponseCount: 0,
    });
    expect(presentation.questionNumber).toBeTruthy();
    expect(presentation.studentHeight).toMatch(/^\d+\.\d{2}$/);
    expect(presentation.placement).toMatch(/^(response|appended)$/);
  }
});

test('renders legacy v2 questions for paper', async ({ page, courseInstance }) => {
  const assessmentInstanceId = await makePrintableAssessmentInstance(
    courseInstance,
    'exam24-printingLegacyQuestions',
  );

  await page.goto(paperUrl(courseInstance, assessmentInstanceId));
  const layout = await readPaginatedQuestionLayout(page);
  expect(Object.keys(layout.questionPages)).toEqual(['1', '2', '3']);

  const legacyRenderStatuses = await page
    .locator('.pagedjs_page .printing-question')
    .evaluateAll((questions) =>
      Object.fromEntries(
        questions.map((question) => [
          (question as HTMLElement).dataset.questionNumber,
          question.querySelector<HTMLElement>('.question-container')?.dataset
            .legacyQuestionRenderStatus,
        ]),
      ),
    );
  expect(legacyRenderStatuses).toEqual({ '1': 'complete', '2': 'complete', '3': 'complete' });

  // The Calculation question is rendered in the browser from its client-side template, so its
  // prompt text only exists if that render succeeded.
  const pages = page.locator('.pagedjs_page');
  await expect(pages.getByText('Define the vector')).toBeVisible();
  await expect(pages.getByText('Check the TRUE statements.')).toBeVisible();
});

test('fails the document when a legacy question cannot render in the browser', async ({
  page,
  courseInstance,
}) => {
  const assessmentInstanceId = await makePrintableAssessmentInstance(
    courseInstance,
    'exam25-printingBrokenClientRender',
  );
  const endpoint = paperUrl(courseInstance, assessmentInstanceId);

  await page.goto(endpoint);
  const html = page.locator('html').first();
  await expect(html).toHaveAttribute('data-print-status', 'error', { timeout: 30_000 });
  await expect(html).toHaveAttribute(
    'data-print-error',
    'Question 2 could not be rendered for paper: Deliberately broken client render',
  );
  await expect(page.locator('#exam-print-status')).toContainText(
    'Unable to paginate this exam: Question 2 could not be rendered for paper',
  );
  await expect(page.locator('.pagedjs_page')).toHaveCount(0);

  const pdfResponse = await page.request.get(endpoint.replace('/paper/preview?', '/paper/pdf?'), {
    timeout: 120_000,
  });
  expect(pdfResponse.status()).toBe(500);
});
