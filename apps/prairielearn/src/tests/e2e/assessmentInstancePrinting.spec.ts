import type { Page } from '@playwright/test';
import axe from 'axe-core';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import type { CourseInstance } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectVariantsByInstanceQuestion } from '../../models/variant.js';
import { getConfiguredUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForPrintablePage } from './utils/printing.js';

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
    await page.goto(`${paperUrl(courseInstance, assessmentInstanceId)}&document=${document}`);
    await readPaginatedQuestionLayout(page);
    await expect(page.getByText('Consider two numbers', { exact: false })).toBeVisible();
    const { violations } = await page.evaluate(async () => await axe.run());
    expect(violations).toEqual([]);
  });
}

test('uses the same selected questions and totals in the exam and answer key', async ({
  page,
  courseInstance,
}) => {
  const assessmentInstanceId = await makePrintableAssessmentInstance(
    courseInstance,
    'exam20-assessmentTools',
  );
  for (const document of ['exam', 'answer_key'] as const) {
    await page.goto(
      `${paperUrl(courseInstance, assessmentInstanceId)}&exclude_question=1&document=${document}`,
    );
    const layout = await readPaginatedQuestionLayout(page);
    expect(Object.keys(layout.questionPages)).toEqual(['2']);
    await expect(page.locator(':root')).toHaveAttribute('data-print-question-count', '1');
    await expect(page.locator(':root')).toHaveAttribute('data-print-max-points', '10');
  }
});

for (const shuffle of [false, true]) {
  test(`prints homework labels and selected question sizes with shuffling=${shuffle}`, async ({
    page,
    courseInstance,
  }) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw15-lockpoints',
    });
    await execute(sql.set_shuffle_questions, {
      assessment_id: assessment.id,
      shuffle_questions: shuffle,
    });
    try {
      const assessmentInstanceId = await makePrintableAssessmentInstance(
        courseInstance,
        'hw15-lockpoints',
      );
      const url = paperUrl(courseInstance, assessmentInstanceId);
      await page.goto(url);
      const questions = Object.keys((await readPaginatedQuestionLayout(page)).questionPages);
      expect(questions).toHaveLength(2);
      if (shuffle) {
        expect(questions[0]).toMatch(/^#\d+$/);
        expect(questions[1]).toMatch(/^#\d+$/);
      } else {
        expect(questions).toEqual(['HW15.1', 'HW15.2']);
      }

      const search = new URLSearchParams({
        question_block_size: `${questions[0]}:half`,
        exclude_question: questions[1],
      });
      await page.goto(`${url}&${search}`);
      const selected = await readPaginatedQuestionLayout(page);
      expect(Object.keys(selected.questionPages)).toEqual([questions[0]]);
      await expect(page.locator(':root')).toHaveAttribute('data-print-question-count', '1');
      await expect(page.locator('.pagedjs_page .printing-question').first()).toHaveAttribute(
        'data-print-block-size',
        'half',
      );
    } finally {
      await execute(sql.set_shuffle_questions, {
        assessment_id: assessment.id,
        shuffle_questions: assessment.shuffle_questions,
      });
    }
  });
}

test('reuses closed homework variants for student copies and answer keys', async ({
  page,
  courseInstance,
}) => {
  const assessmentInstanceId = await makePrintableAssessmentInstance(
    courseInstance,
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

  const response = await page.goto(endpoint);
  expect(response?.status()).toBe(500);
  await expect(page.locator('.pagedjs_page')).toHaveCount(0);
});
