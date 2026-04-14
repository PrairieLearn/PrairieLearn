import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { TEST_COURSE_PATH } from '../../lib/paths.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

async function enterEditMode(page: Page, ciId: string, aId: string): Promise<void> {
  await page.goto(`/pl/course_instance/${ciId}/instructor/assessment/${aId}/questions`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('[aria-label="Drag to reorder"]').first()).toBeVisible();
}

/**
 * Performs a keyboard-based drag using dnd-kit's KeyboardSensor.
 * Focuses the source drag handle, activates it with Space, uses arrow keys
 * to move it, then drops it with Space.
 */
async function keyboardDrag(page: Page, source: Locator, direction: 'up' | 'down', steps: number) {
  const arrowKey = direction === 'up' ? 'ArrowUp' : 'ArrowDown';
  await source.focus();
  await page.keyboard.press(' ');
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(arrowKey);
    // dnd-kit's sortableKeyboardCoordinates reads DOM rects to compute
    // the next drop position. Yield to the event loop so React can
    // commit the state update and dnd-kit can re-measure rects before
    // the next arrow press.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  await page.keyboard.press(' ');
}

async function resetAssessmentFromTemplate({
  assessmentTid,
  testCoursePath,
}: {
  assessmentTid: string;
  testCoursePath: string;
}): Promise<void> {
  const relativePath = path.join(
    'courseInstances',
    'Sp15',
    'assessments',
    assessmentTid,
    'infoAssessment.json',
  );
  await fs.copyFile(
    path.join(TEST_COURSE_PATH, relativePath),
    path.join(testCoursePath, relativePath),
  );
  await syncCourse(testCoursePath);
}

test.describe('Assessment questions', () => {
  test.describe('exam5-perZoneGrading mutations', () => {
    const assessmentTid = 'exam5-perZoneGrading';

    test.beforeEach(async ({ testCoursePath }) => {
      await resetAssessmentFromTemplate({ assessmentTid, testCoursePath });
    });

    test('can reorder a question within a zone and save', async ({
      page,
      testCoursePath,
      courseInstance,
    }) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstance.id,
        tid: assessmentTid,
      });

      await enterEditMode(page, courseInstance.id, assessment.id);

      const dragHandles = page.locator('[aria-label="Drag to reorder"]');
      await expect(dragHandles).toHaveCount(4);

      // Move partialCredit3 (index 2) up one position before partialCredit2
      await keyboardDrag(page, dragHandles.nth(2), 'up', 1);

      await page.getByRole('button', { name: 'Save and sync' }).click();
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

      const infoAssessmentPath = path.join(
        testCoursePath,
        'courseInstances/Sp15/assessments',
        assessmentTid,
        'infoAssessment.json',
      );
      const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
      const savedAssessment = JSON.parse(savedContent);

      expect(savedAssessment.zones).toEqual([
        {
          title: 'Questions to test maxPoints',
          maxPoints: 5,
          questions: [{ id: 'partialCredit1', autoPoints: [10, 5, 1] }],
        },
        {
          title: 'Questions to test maxPoints and bestQuestions together',
          bestQuestions: 2,
          maxPoints: 15,
          questions: [
            { id: 'partialCredit3', autoPoints: [15, 10, 5, 1] },
            { id: 'partialCredit2', autoPoints: [10, 5, 1] },
            { id: 'partialCredit4_v2', autoPoints: [20, 15, 10, 5, 1] },
          ],
        },
      ]);
    });

    test('can drag a question across zones', async ({ page, testCoursePath, courseInstance }) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstance.id,
        tid: assessmentTid,
      });

      await enterEditMode(page, courseInstance.id, assessment.id);

      const dragHandles = page.locator('[aria-label="Drag to reorder"]');
      await expect(dragHandles).toHaveCount(4);

      // Drag partialCredit4_v2 (last, zone 2) up to zone 1.
      // 4 steps: 3 questions + 1 zone header (also a droppable) in between.
      await keyboardDrag(page, dragHandles.nth(3), 'up', 4);

      await page.getByRole('button', { name: 'Save and sync' }).click();
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

      const infoAssessmentPath = path.join(
        testCoursePath,
        'courseInstances/Sp15/assessments',
        assessmentTid,
        'infoAssessment.json',
      );
      const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
      const savedAssessment = JSON.parse(savedContent);

      expect(savedAssessment.zones[0].questions.map((q: { id: string }) => q.id)).toEqual([
        'partialCredit4_v2',
        'partialCredit1',
      ]);
      expect(savedAssessment.zones[1].questions.map((q: { id: string }) => q.id)).toEqual([
        'partialCredit2',
        'partialCredit3',
      ]);
    });
  });

  test('can edit question points and zone settings', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const assessmentTid = 'hw4-perzonegrading';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstance.id, assessment.id);

    await page.getByRole('button').filter({ hasText: 'partialCredit1' }).first().click();

    const autoPointsInput = page.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('10');

    const triesPerVariantInput = page.getByLabel('Tries per variant');
    await triesPerVariantInput.clear();
    await triesPerVariantInput.fill('2');

    await page
      .getByRole('button')
      .filter({ hasText: 'Questions to test bestQuestions' })
      .first()
      .click();

    const bestQuestionsInput = page.getByLabel('Best questions');
    await bestQuestionsInput.clear();
    await bestQuestionsInput.fill('2');

    // Wait for auto-save to propagate before saving
    await expect(async () => {
      const hiddenZones = await page.locator('input[name="zones"]').inputValue();
      const parsedZones = JSON.parse(hiddenZones);
      expect(parsedZones[1].bestQuestions).toBe(2);
    }).toPass({ timeout: 5000 });

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

    const infoAssessmentPath = path.join(
      testCoursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    expect(savedAssessment.zones).toEqual([
      {
        title: 'Questions to test maxPoints',
        maxPoints: 7,
        questions: [{ id: 'partialCredit4_v2', autoPoints: 4, maxAutoPoints: 8 }],
      },
      {
        title: 'Questions to test bestQuestions',
        bestQuestions: 2,
        questions: [
          { id: 'partialCredit1', autoPoints: 10, maxAutoPoints: 30, triesPerVariant: 2 },
          { id: 'partialCredit2', autoPoints: 5, maxAutoPoints: 40 },
          { id: 'partialCredit3', autoPoints: 5, maxAutoPoints: 50 },
        ],
      },
    ]);
  });

  test('can use question picker to change a question QID', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const assessmentTid = 'hw3-partialCredit';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstance.id, assessment.id);

    await page.getByRole('button').filter({ hasText: 'partialCredit1' }).first().click();

    const maxAutoPointsInput = page.getByLabel('Max auto points');
    await maxAutoPointsInput.clear();
    await maxAutoPointsInput.fill('10');

    const autoPointsInput = page.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('7');

    // Wait for auto-save to propagate before switching to the picker
    await expect(async () => {
      const hiddenZones = await page.locator('input[name="zones"]').inputValue();
      const parsedZones = JSON.parse(hiddenZones);
      expect(parsedZones[0].questions[0].autoPoints).toBe(7);
    }).toPass({ timeout: 5000 });

    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await expect(page.getByLabel('Search by QID or title')).toBeVisible();

    await page.getByLabel('Search by QID or title').fill('differentiatePolynomial');

    await expect(page.getByText(/1 question/)).toBeVisible();

    await page.getByRole('button', { name: /^differentiatePolynomial:/ }).click();

    await expect(page.getByLabel('QID', { exact: true })).toHaveValue('differentiatePolynomial');
    await expect(page.getByLabel('Auto points', { exact: true })).toHaveValue('7');

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

    const infoAssessmentPath = path.join(
      testCoursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    expect(savedAssessment.zones).toEqual([
      {
        questions: [
          { id: 'differentiatePolynomial', autoPoints: 7, maxAutoPoints: 10 },
          { id: 'partialCredit2', autoPoints: 2, maxAutoPoints: 10, manualPoints: 3 },
          { id: 'partialCredit3', autoPoints: 2, maxAutoPoints: 10, triesPerVariant: 3 },
          { id: 'partialCredit4_v2', autoPoints: 3, maxAutoPoints: 10 },
          { id: 'partialCredit6_no_partial', autoPoints: 3, maxAutoPoints: 11 },
        ],
      },
    ]);
  });

  test.describe('hw16-editorTest alt pool mutations', () => {
    const assessmentTid = 'hw16-editorTest';

    test.beforeEach(async ({ testCoursePath }) => {
      await resetAssessmentFromTemplate({ assessmentTid, testCoursePath });
    });

    test('can add an alternative to an alt pool and save', async ({
      page,
      testCoursePath,
      courseInstance,
    }) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstance.id,
        tid: assessmentTid,
      });

      await enterEditMode(page, courseInstance.id, assessment.id);

      await page
        .getByRole('button')
        .filter({ hasText: /2 alternatives \(1 chosen\)/ })
        .click();

      await page.getByRole('button', { name: 'Add alternative', exact: true }).first().click();
      await expect(page.getByLabel('Search by QID or title')).toBeVisible();

      await page.getByLabel('Search by QID or title').fill('addNumbers');
      await page.getByRole('button', { name: /^addNumbers:/ }).click();

      await page.getByRole('button', { name: 'Done' }).click();

      await page.getByRole('button', { name: 'Save and sync' }).click();
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

      const infoAssessmentPath = path.join(
        testCoursePath,
        'courseInstances/Sp15/assessments',
        assessmentTid,
        'infoAssessment.json',
      );
      const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
      const savedAssessment = JSON.parse(savedContent);

      const altPoolBlock = savedAssessment.zones[2].questions[1];
      expect(altPoolBlock.numberChoose).toBe(1);
      expect(altPoolBlock.alternatives).toHaveLength(3);
      expect(altPoolBlock.alternatives[2].id).toBe('addNumbers');
    });

    test('revalidates number to choose when alternatives are deleted from the tree', async ({
      page,
      courseInstance,
    }) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstance.id,
        tid: assessmentTid,
      });

      await enterEditMode(page, courseInstance.id, assessment.id);

      await page
        .getByRole('button')
        .filter({ hasText: /2 alternatives \(1 chosen\)/ })
        .click();

      const numberChooseInput = page.getByLabel('Number to choose');
      await numberChooseInput.clear();
      await numberChooseInput.fill('2');
      const warningText = 'Number to choose exceeds the number of alternatives in this pool.';
      await expect(page.getByText(warningText)).not.toBeVisible();

      await page
        .getByRole('button', { name: 'Delete question aiGradingMultiImageCapture', exact: true })
        .click();

      await expect(page.getByText(warningText)).toBeVisible();
    });
  });

  test('can delete questions and a zone', async ({ page, testCoursePath, courseInstance }) => {
    const assessmentTid = 'hw16-editorTest';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstance.id, assessment.id);

    await page.getByRole('button').filter({ hasText: 'partialCredit1' }).first().click();
    await page.locator('[aria-label="Delete question partialCredit1"]').first().click();

    await page.getByRole('button').filter({ hasText: 'partialCredit2' }).first().click();
    await page.locator('[aria-label="Delete question partialCredit2"]').first().click();

    // Save should be disabled because the zone has 0 questions
    const saveButton = page.getByRole('button', { name: 'Save and sync' });
    await expect(saveButton).toBeDisabled();

    await page.getByRole('button').filter({ hasText: 'Zone to delete' }).first().click();
    await page.locator('[aria-label="Delete zone \'Zone to delete\'"]').last().click();

    await saveButton.click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

    const infoAssessmentPath = path.join(
      testCoursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    expect(savedAssessment.zones).toHaveLength(2);
    expect(savedAssessment.zones[0].title).toBe('Keep zone');
    expect(savedAssessment.zones[0].questions).toEqual([
      { id: 'downloadFile', autoPoints: 5, maxAutoPoints: 10 },
    ]);
  });

  test('shows validation errors for homework auto points', async ({ page, courseInstance }) => {
    const assessmentTid = 'hw2-miscProblems';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstance.id, assessment.id);

    await page.getByRole('button').filter({ hasText: 'fossilFuelsRadio' }).first().click();

    const autoPointsInput = page.getByLabel('Auto points', { exact: true });

    await autoPointsInput.clear();
    await expect(
      page.getByText('At least one of auto points or manual points must be set.').first(),
    ).toBeVisible();

    await autoPointsInput.fill('0');
    await expect(
      page.getByText('Auto points cannot be 0 when max auto points is greater than 0.'),
    ).toBeVisible();

    await autoPointsInput.clear();
    await autoPointsInput.fill('15');
    await expect(page.getByText('Auto points cannot exceed max auto points.')).toBeVisible();

    await autoPointsInput.clear();
    await autoPointsInput.fill('5');
    await expect(
      page.getByText('At least one of auto points or manual points must be set.'),
    ).not.toBeVisible();
    await expect(
      page.getByText('Auto points cannot be 0 when max auto points is greater than 0.'),
    ).not.toBeVisible();
    await expect(page.getByText('Auto points cannot exceed max auto points.')).not.toBeVisible();
  });

  test('can edit exam points list', async ({ page, testCoursePath, courseInstance }) => {
    const assessmentTid = 'exam12-sequentialQuestions';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstance.id, assessment.id);

    await page.getByRole('button').filter({ hasText: 'partialCredit3' }).first().click();
    await expect(page.getByLabel('Auto points', { exact: true })).toBeVisible();

    const autoPointsInput = page.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('8, 4, 2');

    // Wait for auto-save to propagate the points change to the hidden form input
    await expect(async () => {
      const hiddenZones = await page.locator('input[name="zones"]').inputValue();
      const parsedZones = JSON.parse(hiddenZones);
      expect(parsedZones[1].questions[0].autoPoints).toEqual([8, 4, 2]);
    }).toPass({ timeout: 5000 });

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

    const infoAssessmentPath = path.join(
      testCoursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    expect(savedAssessment.zones[1].questions[0].autoPoints).toEqual([8, 4, 2]);
  });

  test('can add a question to an empty assessment via zone and picker', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const assessmentTid = 'hw14-emptyForEditor';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
    );
    await page.getByRole('button', { name: 'Edit', exact: true }).click();

    await page.getByRole('button', { name: 'Add zone' }).click();
    await page.getByRole('button', { name: 'Add question' }).click();
    await expect(page.getByLabel('Search by QID or title')).toBeVisible();

    await page.getByLabel('Search by QID or title').fill('partialCredit1');
    await page.getByRole('button', { name: /^partialCredit1:/ }).click();
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button').filter({ hasText: 'partialCredit1' }).first().click();

    const autoPointsInput = page.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('5');

    // Wait for auto-save to propagate before saving
    await expect(async () => {
      const hiddenZones = await page.locator('input[name="zones"]').inputValue();
      const parsedZones = JSON.parse(hiddenZones);
      expect(parsedZones[0].questions[0].autoPoints).toBe(5);
    }).toPass({ timeout: 5000 });

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

    const infoAssessmentPath = path.join(
      testCoursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    expect(savedAssessment.zones).toEqual([
      {
        questions: [{ id: 'partialCredit1', autoPoints: 5 }],
      },
    ]);
  });

  test('group assessment round-trip preserves canView and canSubmit', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const assessmentTid = 'hw5-templateGroupWork';
    await resetAssessmentFromTemplate({ assessmentTid, testCoursePath });

    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstance.id, assessment.id);

    // Click on the first question and change its points to trigger a save
    await page.getByRole('button').filter({ hasText: 'demoNewton-page1' }).first().click();
    const autoPointsInput = page.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('2');

    // Wait for auto-save to propagate
    await expect(async () => {
      const hiddenZones = await page.locator('input[name="zones"]').inputValue();
      const parsedZones = JSON.parse(hiddenZones);
      expect(parsedZones[0].questions[0].autoPoints).toBe(2);
    }).toPass({ timeout: 5000 });

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

    const infoAssessmentPath = path.join(
      testCoursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    const zone = savedAssessment.zones[0];

    // Zone-level canSubmit should be preserved
    expect(zone.canSubmit).toEqual(['Recorder']);

    // Question-level canView/canSubmit should be preserved
    const q2 = zone.questions[1];
    expect(q2.canView).toEqual(['Recorder']);

    const q3 = zone.questions[2];
    expect(q3.canView).toEqual(['Reflector']);
    expect(q3.canSubmit).toEqual(['Reflector']);
  });
});
