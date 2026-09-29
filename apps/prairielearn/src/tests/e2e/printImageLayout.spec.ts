import fs from 'node:fs/promises';
import path from 'node:path';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { syncCourse } from '../helperCourse.js';
import { getConfiguredUser } from '../utils/auth.js';

import { test as base, expect } from './fixtures.js';
import { waitForPrintablePage } from './utils/printing.js';

const test = base.extend<{
  imageQuestion: (html: string) => Promise<string>;
}>({
  imageQuestion: async ({ testCoursePath, courseInstance }, use) => {
    const questionPath = path.join(testCoursePath, 'questions/addNumbers/question.html');
    const original = await fs.readFile(questionPath, 'utf8');
    const assessmentPath = path.join(
      testCoursePath,
      'courseInstances/Sp15/assessments/exam20-assessmentTools/infoAssessment.json',
    );
    const originalAssessment = await fs.readFile(assessmentPath, 'utf8');
    try {
      // Each template needs fresh variants, even when these tests share a worker.
      await fs.writeFile(
        assessmentPath,
        JSON.stringify({ ...JSON.parse(originalAssessment), multipleInstance: true }),
      );
      await use(async (html) => {
        await fs.writeFile(questionPath, html);
        await syncCourse(testCoursePath);
        const user = await getConfiguredUser();
        const assessment = await selectAssessmentByTid({
          course_instance_id: courseInstance.id,
          tid: 'exam20-assessmentTools',
        });
        const instanceId = await makeAssessmentInstance({
          assessment,
          user_id: user.id,
          authn_user_id: user.id,
          mode: 'Public',
          time_limit_min: null,
          date: new Date(),
          client_fingerprint_id: null,
        });
        return `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${instanceId}/paper/preview`;
      });
    } finally {
      await fs.writeFile(questionPath, original);
      await fs.writeFile(assessmentPath, originalAssessment);
      await syncCourse(testCoursePath);
    }
  },
});

test.describe.configure({ timeout: 180_000 });

function imageChoices({
  element,
  dimensions,
}: {
  element: 'pl-multiple-choice' | 'pl-checkbox';
  dimensions: { width: number; height: number }[];
}): string {
  const choices = dimensions.map(({ width, height }, index) => {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ddd"/><circle cx="${width / 2}" cy="${height / 2}" r="${height / 3}" fill="#222"/></svg>`,
    ).toString('base64');
    return `<pl-answer correct="${index === 0}"><div class="container-fluid mb-3"><img src="data:image/svg+xml;base64,${svg}" width="${width}" alt="Image choice ${index + 1}" /></div></pl-answer>`;
  });
  return `<pl-question-panel><p>Choose the matching diagram.</p></pl-question-panel><${element} answers-name="image" order="fixed">${choices.join('')}</${element}>`;
}

test('fits image choices uniformly within the paper and requested question block', async ({
  page,
  imageQuestion,
}) => {
  const preview = await imageQuestion(
    imageChoices({
      element: 'pl-multiple-choice',
      dimensions: Array.from({ length: 4 }, () => ({ width: 250, height: 250 })),
    }),
  );
  for (const [paperSize, blockSize] of [
    ['Letter', 'auto'],
    ['A4', 'auto'],
    ['Letter', 'half'],
  ]) {
    const response = await page.goto(
      `${preview}?exclude_question=2&paper_size=${paperSize}&block_size=${blockSize}`,
    );
    expect(response!.ok()).toBe(true);
    await waitForPrintablePage(page);
    const images = page.getByRole('img', { name: /^Image choice / });
    await expect(images).toHaveCount(4);
    const measurements = await images.evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        const page = element.closest('.pagedjs_page')!;
        const area = page.querySelector('.pagedjs_area')!.getBoundingClientRect();
        const question = element.closest('.printing-question')!.getBoundingClientRect();
        return {
          width: bounds.width,
          height: bounds.height,
          page: page.getAttribute('data-page-number'),
          overflow: Math.max(
            area.left - bounds.left,
            bounds.right - area.right,
            area.top - bounds.top,
            bounds.bottom - area.bottom,
            bounds.bottom - question.bottom,
          ),
          questionHeight: question.height,
          pageHeight: area.height,
        };
      }),
    );
    expect(new Set(measurements.map(({ page }) => page)).size).toBe(1);
    for (const image of measurements) {
      expect(image.width).toBeGreaterThan(0);
      expect(image.width).toBeLessThan(250);
      expect(image.width).toBeCloseTo(measurements[0].width, 1);
      expect(image.height).toBeCloseTo(measurements[0].height, 1);
      expect(image.width / image.height).toBeCloseTo(1, 2);
      expect(image.overflow).toBeLessThanOrEqual(1);
      expect(image.questionHeight).toBeLessThanOrEqual(
        image.pageHeight * (blockSize === 'half' ? 0.5 : 1) + 1,
      );
    }
  }
  for (const blockSize of ['auto', 'half']) {
    const response = await page.goto(
      `${preview}?exclude_question=2&paper_size=Letter&document=answer_key&block_size=${blockSize}`,
    );
    expect(response!.ok()).toBe(true);
    await waitForPrintablePage(page);
    await expect(page.getByRole('img', { name: 'Image choice 1', exact: true })).toHaveCount(1);
  }
});

test('preserves fitting checkbox images and their different aspect ratios', async ({
  page,
  imageQuestion,
}) => {
  const dimensions = [
    { width: 60, height: 30 },
    { width: 60, height: 40 },
  ];
  const preview = await imageQuestion(imageChoices({ element: 'pl-checkbox', dimensions }));
  const response = await page.goto(`${preview}?exclude_question=2&paper_size=Letter`);
  expect(response!.ok()).toBe(true);
  await waitForPrintablePage(page);
  for (const [index, { width, height }] of dimensions.entries()) {
    const image = page.getByRole('img', { name: `Image choice ${index + 1}`, exact: true });
    const bounds = await image.boundingBox();
    expect(bounds!.width).toBeCloseTo(width, 1);
    expect(bounds!.height).toBeCloseTo(height, 1);
  }
});

for (const element of ['pl-multiple-choice', 'pl-checkbox'] as const) {
  test(`keeps a full page of ${element} choices at its measured height`, async ({
    page,
    imageQuestion,
  }) => {
    const preview = await imageQuestion(
      imageChoices({
        element,
        dimensions: Array.from({ length: 4 }, () => ({ width: 60, height: 30 })),
      }),
    );
    await page.addInitScript(() => {
      // Fill the remaining space after images and fonts settle, just before page planning.
      // This exercises the page boundary without depending on platform-specific font metrics.
      Reflect.set(window, '__PL_PRINT_CAPTURE_SOURCE__', (source: HTMLElement) => {
        const measure = document.createElement('div');
        measure.className = 'exam-print-page-measure';
        source.append(measure);
        const question = source.querySelector<HTMLElement>('.printing-question')!;
        question.style.paddingTop = `${measure.getBoundingClientRect().height - question.getBoundingClientRect().height}px`;
        measure.remove();
      });
    });

    await page.goto(`${preview}?exclude_question=2&paper_size=Letter&block_size=auto`);
    await waitForPrintablePage(page);
    await expect(page.locator('.pagedjs_page')).toHaveCount(2);
    const question = page.getByRole('region', { name: 'Question 1', exact: true });
    await expect(question).toHaveCount(1);
    await expect(question.getByRole('img', { name: /^Image choice / })).toHaveCount(4);
    const height = await question.evaluate((element) => ({
      measured: Number(element.dataset.printMeasuredHeight),
      actual: element.getBoundingClientRect().height,
    }));
    expect(height.actual).toBeCloseTo(height.measured, 1);
  });
}

test('reports an impossible block size without removing text or images', async ({
  page,
  imageQuestion,
}) => {
  const paragraphs = Array.from(
    { length: 40 },
    (_, index) => `<p>Printed instruction ${index + 1} must remain readable.</p>`,
  ).join('');
  const preview = await imageQuestion(
    `<pl-question-panel>${paragraphs}</pl-question-panel>${imageChoices({
      element: 'pl-checkbox',
      dimensions: Array.from({ length: 2 }, () => ({ width: 60, height: 30 })),
    })}`,
  );
  const response = await page.goto(
    `${preview}?exclude_question=2&paper_size=Letter&block_size=half`,
  );
  expect(response!.ok()).toBe(true);
  await expect(page.locator(':root')).toHaveAttribute('data-print-status', 'error', {
    timeout: 120_000,
  });
  await expect(page.locator(':root')).toHaveAttribute(
    'data-print-error-code',
    'question-block-size-overflow',
  );
  await expect(page.getByText('Printed instruction 40 must remain readable.')).toHaveCount(1);
  const images = page.locator('img[alt^="Image choice "]');
  await expect(images).toHaveCount(2);
  for (const image of await images.all()) {
    const bounds = await image.boundingBox();
    expect(bounds!.width).toBeCloseTo(60, 1);
    expect(bounds!.height).toBeCloseTo(30, 1);
  }
});
