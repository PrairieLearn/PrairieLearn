import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Page } from '@playwright/test';

import { features } from '../../lib/features/index.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

async function enterEditMode(page: Page, ciId: string, aId: string): Promise<void> {
  await page.goto(`/pl/course_instance/${ciId}/instructor/assessment/${aId}/questions`);
  await page.getByRole('button', { name: 'Edit questions' }).click();
  await expect(page.locator('[aria-label="Drag to reorder"]').first()).toBeVisible();
}

test.describe('Assessment questions', () => {
  let courseInstanceId: string;
  let wasFeatureEnabled: boolean;

  test.beforeAll(async ({ testCoursePath }) => {
    await syncCourse(testCoursePath);

    wasFeatureEnabled = await features.enabled('assessment-questions-editor');
    await features.enable('assessment-questions-editor');

    const course = await selectCourseByShortName('QA 101');
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
    courseInstanceId = courseInstance.id;
  });

  test.afterAll(async () => {
    if (!wasFeatureEnabled) {
      await features.disable('assessment-questions-editor');
    }
  });

  test('can reorder a question within a zone and save', async ({ page, testCoursePath }) => {
    const assessmentTid = 'exam5-perZoneGrading';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstanceId, assessment.id);

    const dragHandles = page.locator('[aria-label="Drag to reorder"]');
    await expect(dragHandles).toHaveCount(4);

    // Drag partialCredit3 (index 2) above partialCredit2 (index 1) using pointer DnD
    await dragHandles.nth(2).dragTo(dragHandles.nth(1));

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit questions' })).toBeVisible();

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

  test('can edit question points and zone settings', async ({ page, testCoursePath }) => {
    const assessmentTid = 'hw4-perzonegrading';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstanceId, assessment.id);

    // Click partialCredit1 in the tree to open its detail panel
    await page.getByRole('button').filter({ hasText: 'partialCredit1' }).first().click();

    const autoPointsInput = page.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('10');

    const triesPerVariantInput = page.getByLabel('Tries per variant');
    await triesPerVariantInput.clear();
    await triesPerVariantInput.fill('2');

    await page.getByRole('button', { name: 'Apply' }).click();

    // Click zone header to open zone detail panel
    await page
      .getByRole('button')
      .filter({ hasText: 'Questions to test bestQuestions' })
      .first()
      .click();

    const bestQuestionsInput = page.getByLabel('Best questions');
    await bestQuestionsInput.clear();
    await bestQuestionsInput.fill('2');

    await page.getByRole('button', { name: 'Apply' }).click();

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit questions' })).toBeVisible();

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

  test('can use question picker to change a question QID', async ({ page, testCoursePath }) => {
    const assessmentTid = 'hw3-partialCredit';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstanceId, assessment.id);

    // Click partialCredit1 in the tree
    await page.getByRole('button').filter({ hasText: 'partialCredit1' }).first().click();

    // Apply the points change first (form state is lost when picker opens)
    const autoPointsInput = page.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('7');
    await page.getByRole('button', { name: 'Apply' }).click();

    // Open picker to change QID
    await page.getByRole('button', { name: 'Pick' }).click();
    await expect(page.getByLabel('Search by QID or title')).toBeVisible();

    await page.getByLabel('Search by QID or title').fill('differentiate');

    await page.getByRole('button', { name: 'Filter by Topic' }).click();
    await page.getByRole('option', { name: 'Calculus' }).click();
    // Dismiss the filter popover (Escape works since there's no modal to capture it)
    await page.keyboard.press('Escape');

    await expect(page.getByText(/1 question/)).toBeVisible();

    // Select differentiatePolynomial from picker (aria-label format: "qid: title")
    await page.getByRole('button', { name: /^differentiatePolynomial:/ }).click();

    // Verify QID was updated in the detail panel
    await expect(page.getByLabel('QID')).toHaveValue('differentiatePolynomial');
    await expect(page.getByLabel('Auto points', { exact: true })).toHaveValue('7');

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit questions' })).toBeVisible();

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
          { id: 'differentiatePolynomial', points: 7, maxPoints: 5 },
          { id: 'partialCredit2', autoPoints: 2, maxAutoPoints: 10, manualPoints: 3 },
          { id: 'partialCredit3', points: 2, maxPoints: 10, triesPerVariant: 3 },
          { id: 'partialCredit4_v2', points: 3, maxPoints: 10 },
          { id: 'partialCredit6_no_partial', points: 3, maxPoints: 11 },
        ],
      },
    ]);
  });

  test('can add a question to an empty assessment via zone and picker', async ({
    page,
    testCoursePath,
  }) => {
    const assessmentTid = 'hw14-emptyForEditor';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: assessmentTid,
    });

    await page.goto(
      `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessment.id}/questions`,
    );
    await page.getByRole('button', { name: 'Edit questions' }).click();

    // Add a new zone (directly creates, no modal)
    await page.getByRole('button', { name: 'Add zone' }).click();

    // Open picker via "Add question" button in the zone
    await page.getByRole('button', { name: 'Add question' }).click();
    await expect(page.getByLabel('Search by QID or title')).toBeVisible();

    await page.getByLabel('Search by QID or title').fill('partialCredit1');
    // Select from picker (aria-label format: "qid: title")
    await page.getByRole('button', { name: /^partialCredit1:/ }).click();

    // Close picker
    await page.getByRole('button', { name: 'Done' }).click();

    // Select the added question in the tree to edit its points
    await page.getByRole('button').filter({ hasText: 'partialCredit1' }).first().click();

    const autoPointsInput = page.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('5');
    await page.getByRole('button', { name: 'Apply' }).click();

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await expect(page.getByRole('button', { name: 'Edit questions' })).toBeVisible();

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
});
