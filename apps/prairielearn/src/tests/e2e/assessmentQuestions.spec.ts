import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Page } from '@playwright/test';

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
 * Performs a pointer-based drag using dnd-kit's PointerSensor.
 * Uses Playwright's low-level mouse API to simulate a real drag gesture.
 *
 * TODO: this is super ugly, we should figure out how to avoid this. We should be able to use keyboard shortcuts to drag and drop.
 */
async function pointerDrag(
  page: Page,
  source: ReturnType<Page['locator']>,
  target: ReturnType<Page['locator']>,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Could not get bounding boxes');

  const sx = sourceBox.x + sourceBox.width / 2;
  const sy = sourceBox.y + sourceBox.height / 2;
  const tx = targetBox.x + targetBox.width / 2;
  const ty = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Move in small steps to trigger PointerSensor's distance constraint
  const stepCount = 10;
  for (let i = 1; i <= stepCount; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / stepCount, sy + ((ty - sy) * i) / stepCount);
  }
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(200);
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
  test.beforeEach(async ({ enableFeatureFlag }) => {
    await enableFeatureFlag('assessment-questions-editor');
  });

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
      await pointerDrag(page, dragHandles.nth(2), dragHandles.nth(1));

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
          questions: [{ id: 'partialCredit1', points: [10, 5, 1] }],
        },
        {
          title: 'Questions to test maxPoints and bestQuestions together',
          bestQuestions: 2,
          maxPoints: 15,
          questions: [
            { id: 'partialCredit3', points: [15, 10, 5, 1] },
            { id: 'partialCredit2', points: [10, 5, 1] },
            { id: 'partialCredit4_v2', points: [20, 15, 10, 5, 1] },
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

      // Drag partialCredit4_v2 (last, zone 2) up to zone 1
      await pointerDrag(page, dragHandles.nth(3), dragHandles.nth(0));

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
        questions: [{ id: 'partialCredit4_v2', points: 4, maxPoints: 8 }],
      },
      {
        title: 'Questions to test bestQuestions',
        bestQuestions: 2,
        questions: [
          { id: 'partialCredit1', points: 10, maxPoints: 30, triesPerVariant: 2 },
          { id: 'partialCredit2', points: 5, maxPoints: 40 },
          { id: 'partialCredit3', points: 5, maxPoints: 50 },
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
          { id: 'differentiatePolynomial', points: 7, maxPoints: 10 },
          { id: 'partialCredit2', autoPoints: 2, maxAutoPoints: 10, manualPoints: 3 },
          { id: 'partialCredit3', points: 2, maxPoints: 10, triesPerVariant: 3 },
          { id: 'partialCredit4_v2', points: 3, maxPoints: 10 },
          { id: 'partialCredit6_no_partial', points: 3, maxPoints: 11 },
        ],
      },
    ]);
  });

  test.describe('hw16-editorTest alt group mutations', () => {
    const assessmentTid = 'hw16-editorTest';

    test.beforeEach(async ({ testCoursePath }) => {
      await resetAssessmentFromTemplate({ assessmentTid, testCoursePath });
    });

    test('can add an alternative to an alt group and save', async ({
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
        .filter({ hasText: /Choose 1 of 2/ })
        .click();

      await page.getByRole('button', { name: 'Add alternative', exact: true }).last().click();
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

      const lastBlock = savedAssessment.zones.at(-1).questions.at(-1);
      expect(lastBlock.numberChoose).toBe(1);
      expect(lastBlock.alternatives).toHaveLength(3);
      expect(lastBlock.alternatives[2].id).toBe('addNumbers');
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
        .filter({ hasText: /Choose 1 of 2/ })
        .click();

      const numberChooseInput = page.getByLabel('Number to choose');
      await numberChooseInput.clear();
      await numberChooseInput.fill('2');
      await expect(page.getByText('Cannot exceed number of alternatives (2).')).not.toBeVisible();

      await page
        .getByRole('button', { name: 'Delete aiGradingMultiImageCapture', exact: true })
        .click();

      await expect(page.getByText('Cannot exceed number of alternatives (1).')).toBeVisible();
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
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await page.getByRole('button').filter({ hasText: 'partialCredit2' }).first().click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // Save should be disabled because the zone has 0 questions
    const saveButton = page.getByRole('button', { name: 'Save and sync' });
    await expect(saveButton).toBeDisabled();

    await page.getByRole('button').filter({ hasText: 'Zone to delete' }).first().click();
    await page.getByRole('button', { name: 'Delete zone', exact: true }).last().click();

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
      { id: 'downloadFile', points: 5, maxPoints: 10 },
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
    await expect(page.getByLabel('Points', { exact: true })).toBeVisible();

    const pointsInput = page.getByLabel('Points', { exact: true });
    await pointsInput.clear();
    await pointsInput.fill('8, 4, 2');

    // Wait for auto-save to propagate the points change to the hidden form input
    await expect(async () => {
      const hiddenZones = await page.locator('input[name="zones"]').inputValue();
      const parsedZones = JSON.parse(hiddenZones);
      expect(parsedZones[1].questions[0].points).toEqual([8, 4, 2]);
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

    expect(savedAssessment.zones[1].questions[0].points).toEqual([8, 4, 2]);
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
        questions: [{ id: 'partialCredit1', points: 5 }],
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
