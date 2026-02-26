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

  test('can drag a question between zones and save', async ({ page, testCoursePath }) => {
    const assessmentTid = 'exam5-perZoneGrading';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstanceId, assessment.id);

    const dragHandles = page.locator('[aria-label="Drag to reorder"]');
    await expect(dragHandles).toHaveCount(4);

    const dragHandle = dragHandles.nth(2);
    await dragHandle.focus();
    await expect(dragHandle).toBeFocused();
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    await expect(dragHandles).toHaveCount(4);

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

    const questionRow = page.locator('tr').filter({ hasText: 'partialCredit1' });
    await questionRow.getByRole('button', { name: 'Edit question' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Edit question')).toBeVisible();

    const pointsInput = modal.getByLabel('Auto points', { exact: true });
    await pointsInput.clear();
    await pointsInput.fill('10');

    const triesPerVariantInput = modal.getByLabel('Tries Per Variant');
    await triesPerVariantInput.clear();
    await triesPerVariantInput.fill('2');

    await modal.getByRole('button', { name: 'Update question' }).click();
    await expect(modal).not.toBeVisible();

    const zoneRow = page.locator('tr').filter({ hasText: 'Zone 2' });
    await zoneRow.getByRole('button', { name: 'Edit zone' }).click();

    await expect(modal).toBeVisible();
    await expect(modal.getByText('Edit zone')).toBeVisible();

    const bestQuestionsInput = modal.getByLabel('Best questions');
    await bestQuestionsInput.clear();
    await bestQuestionsInput.fill('2');

    await modal.getByRole('button', { name: 'Update zone' }).click();
    await expect(modal).not.toBeVisible();

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

    const questionRow = page.locator('tr').filter({ hasText: 'partialCredit1' });
    await questionRow.getByRole('button', { name: 'Edit question' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    const autoPointsInput = modal.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('7');

    await modal.getByRole('button', { name: 'Pick' }).click();
    await expect(modal.getByText('Select question')).toBeVisible();

    await modal.getByLabel('Search by QID or title').fill('differentiate');

    await modal.getByRole('button', { name: 'Filter by Topic' }).click();
    await page.getByRole('option', { name: 'Calculus' }).click();
    // Click the search input to dismiss the react-aria Popover via light dismiss.
    // Escape doesn't work here because the react-bootstrap Modal captures it first.
    await modal.getByLabel('Search by QID or title').click({ force: true });

    await expect(modal.getByText(/1 question/)).toBeVisible();

    await modal.locator('[role="button"]').filter({ hasText: 'differentiatePolynomial' }).click();

    await expect(modal.getByText('Edit question')).toBeVisible();
    await expect(modal.getByLabel('QID')).toHaveValue('differentiatePolynomial');
    await expect(modal.getByLabel('Auto points', { exact: true })).toHaveValue('7');

    await modal.getByRole('button', { name: 'Update question' }).click();
    await expect(modal).not.toBeVisible();

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

    await page.getByRole('button', { name: 'Add zone' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Add zone' }).click();
    await expect(modal).not.toBeVisible();

    await page.getByRole('button', { name: 'Add question in zone 1' }).click();
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Select question')).toBeVisible();

    await modal.getByLabel('Search by QID or title').fill('partialCredit1');
    await modal.locator('[role="button"]').filter({ hasText: 'partialCredit1' }).first().click();

    await expect(modal.locator('.modal-title', { hasText: 'Add question' })).toBeVisible();
    await expect(modal.getByLabel('QID')).toHaveValue('partialCredit1');

    const autoPointsInput = modal.getByLabel('Auto points', { exact: true });
    await autoPointsInput.clear();
    await autoPointsInput.fill('5');

    await modal.getByRole('button', { name: 'Add question' }).click();
    await expect(modal).not.toBeVisible();
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
