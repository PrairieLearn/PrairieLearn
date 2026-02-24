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

    const pointsInput = modal.locator('#auto-points-input');
    await pointsInput.clear();
    await pointsInput.fill('10');

    const triesPerVariantInput = modal.locator('#tries-per-variant-input');
    await triesPerVariantInput.clear();
    await triesPerVariantInput.fill('2');

    await modal.getByRole('button', { name: 'Update question' }).click();
    await expect(modal).not.toBeVisible();

    const zoneRow = page.locator('tr').filter({ hasText: 'Zone 2' });
    await zoneRow.getByRole('button', { name: 'Edit zone' }).click();

    await expect(modal).toBeVisible();
    await expect(modal.getByText('Edit zone')).toBeVisible();

    const bestQuestionsInput = modal.locator('#bestQuestionsInput');
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

  test('can create alternative group and drag question into it', async ({ page, testCoursePath }) => {
    const assessmentTid = 'hw1-automaticTestSuite';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstanceId, assessment.id);

    // Verify we have 11 questions initially
    const dragHandles = page.locator('[aria-label="Drag to reorder"]');
    await expect(dragHandles).toHaveCount(11);

    // Click "Add alternative group" button in the zone
    await page.getByRole('button', { name: 'Add alternative group' }).click();

    // Wait for the modal to appear
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Add alternative group')).toBeVisible();

    // Just create the group with defaults (no points modification)
    // Click Add button
    const addButton = modal.getByRole('button', { name: 'Add group' });
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // Now we should see an empty alternative group warning
    await expect(page.getByText('Empty alternative group')).toBeVisible({ timeout: 10000 });

    // Find the group header row (shows "1 question from these 0:" for empty group with numberChoose=1)
    // The group header row has the drop target, not the warning row
    const groupHeader = page.locator('tr').filter({ hasText: /1 question from these 0/ });
    await expect(groupHeader).toBeVisible({ timeout: 10000 });

    // The first question should be addNumbers - get its drag handle
    // The group header also has a drag handle, so we need to find the one for addNumbers
    const addNumbersRow = page.locator('tr').filter({ hasText: 'addNumbers' });
    await expect(addNumbersRow).toBeVisible();
    const addNumbersDragHandle = addNumbersRow.locator('[aria-label="Drag to reorder"]');

    // Scroll both elements into view
    await groupHeader.scrollIntoViewIfNeeded();
    await addNumbersDragHandle.scrollIntoViewIfNeeded();

    // Drag the question onto the group header
    await performDrag(page, addNumbersDragHandle, groupHeader);

    // Wait for state update after drag
    await page.waitForTimeout(500);

    // The empty group warning should be gone
    await expect(page.getByText('Empty alternative group')).not.toBeVisible();

    // The group header should now show "1 question from these 1"
    await expect(page.getByText(/1 question from these 1/)).toBeVisible();

    // Click save
    await page.getByRole('button', { name: 'Save and sync' }).click();

    // Wait for the page to reload after save (may take longer due to git operations)
    await expect(page.getByRole('button', { name: 'Edit questions' })).toBeVisible({
      timeout: 30000,
    });

    // Read the saved file from disk
    const infoAssessmentPath = path.join(
      testCoursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    // The group was added at the end of the questions array
    // addNumbers was removed from index 0 and added to the group
    // So now we have 10 standalone questions + 1 group = 11 items

    // First question should now be addVectors (was index 1, now index 0)
    expect(savedAssessment.zones[0].questions[0]).toEqual({
      id: 'addVectors',
      points: 2,
      maxPoints: 11,
    });

    // The alternative group with addNumbers should be at the end
    const lastQuestion = savedAssessment.zones[0].questions.at(-1);
    // The group should have alternatives array with addNumbers
    // The original question's points should be preserved in the alternative
    expect(lastQuestion.alternatives).toBeDefined();
    expect(lastQuestion.alternatives.length).toBe(1);
    expect(lastQuestion.alternatives[0].id).toBe('addNumbers');
  });

  // Test assessment has 1 zone with 5 questions:
  // partialCredit1 (points=1, maxPoints=5), partialCredit2, partialCredit3, partialCredit4_v2, partialCredit6_no_partial
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

    const autoPointsInput = modal.locator('#auto-points-input');
    await autoPointsInput.clear();
    await autoPointsInput.fill('7');

    await modal.getByRole('button', { name: 'Pick' }).click();
    await expect(modal.getByText('Select question')).toBeVisible();

    await modal.getByPlaceholder('Search by QID or title...').fill('differentiate');

    await modal.getByRole('button', { name: 'Filter by Topic' }).click();
    await page.getByRole('option', { name: 'Calculus' }).click();
    await modal.getByPlaceholder('Search by QID or title...').click({ force: true });

    await expect(modal.getByText(/1 question/)).toBeVisible();

    await modal.locator('[role="button"]').filter({ hasText: 'differentiatePolynomial' }).click();

    await expect(modal.getByText('Edit question')).toBeVisible();
    await expect(modal.locator('#qid-input')).toHaveValue('differentiatePolynomial');
    await expect(modal.locator('#auto-points-input')).toHaveValue('7');

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
});
