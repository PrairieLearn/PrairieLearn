import type { Page } from '@playwright/test';
import axe from 'axe-core';
import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { createTest, expect } from '../fixtures.js';

import { createPrintableForm, waitForPrintablePage } from './utils.js';

const test = createTest({ features: { 'printable-assessments': true } });
const sql = loadSqlEquiv(import.meta.url);
const RecordCountsSchema = z.object({
  assessment_instances: z.number(),
  instance_questions: z.number(),
  variants: z.number(),
});

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

async function expectAccessiblePreview(page: Page) {
  await expect(page.getByText('Consider two numbers', { exact: false })).toBeVisible();
  await expect(page.locator('script:not([type="application/json"])')).toHaveCount(0);
  const { violations } = await page.evaluate(async () => await axe.run());
  expect(violations).toEqual([]);
}

test('renders accessible previews and readable answer keys for every student question', async ({
  page,
  courseInstance,
}) => {
  await page.context().addInitScript({ content: axe.source });
  const { printUrl } = await createPrintableForm(courseInstance, 'exam20-assessmentTools');
  const initialRecords = await queryRow(sql.select_record_counts, {}, RecordCountsSchema);
  const endpoint = `${printUrl}/preview?paper_size=Letter&identity_field=Section&identity_field=Student%20ID`;

  const assessmentResponse = await page.goto(endpoint);
  const assessmentLayout = await readPaginatedQuestionLayout(page);
  await expectAccessiblePreview(page);
  expect(assessmentResponse?.headers()['content-security-policy']).toContain("script-src 'none'");
  expect(Object.keys(assessmentLayout.questionPages).length).toBeGreaterThan(1);
  const coverPage = page.locator('.pagedjs_page').first();
  await expect(coverPage.getByText('Name', { exact: true })).toBeVisible();
  await expect(coverPage.getByText('Section', { exact: true })).toBeVisible();
  await expect(coverPage.getByText('Student ID', { exact: true })).toBeVisible();
  await expect(coverPage.getByText('Date', { exact: true })).toBeVisible();

  const answerKeyResponse = await page.goto(`${endpoint}&document=answer_key`);
  const answerKeyLayout = await readPaginatedQuestionLayout(page);
  await expectAccessiblePreview(page);
  expect(answerKeyResponse?.headers()['content-security-policy']).toContain("script-src 'none'");

  expect(Object.keys(answerKeyLayout.questionPages)).toEqual(
    Object.keys(assessmentLayout.questionPages),
  );
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
  expect(presentations).toHaveLength(Object.keys(assessmentLayout.questionPages).length);
  for (const presentation of presentations) {
    expect(presentation).toMatchObject({
      answerRegionCount: 1,
      gradingBlockCount: 0,
      visibleStudentResponseCount: 0,
    });
    expect(presentation.questionNumber).toBeTruthy();
  }
  expect(await queryRow(sql.select_record_counts, {}, RecordCountsSchema)).toEqual(initialRecords);
});
