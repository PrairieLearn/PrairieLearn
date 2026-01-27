import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { type Locator, type Page } from '@playwright/test';

import { features } from '../../lib/features/index.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

/**
 * Performs a drag operation using manual mouse events.
 * dnd-kit requires intermediate mouse moves to trigger dragOver events.
 */
async function performDrag(page: Page, source: Locator, target: Locator): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('Could not get bounding boxes for drag elements');
  }

  const sourceCenter = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const targetCenter = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };

  await page.mouse.move(sourceCenter.x, sourceCenter.y);
  await page.mouse.down();

  // Move in steps to trigger dragOver events (dnd-kit requirement)
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      sourceCenter.x + ((targetCenter.x - sourceCenter.x) * i) / steps,
      sourceCenter.y + ((targetCenter.y - sourceCenter.y) * i) / steps,
    );
  }

  await page.mouse.up();
}

async function enterEditMode(page: Page, ciId: string, aId: string): Promise<void> {
  await page.goto(`/pl/course_instance/${ciId}/instructor/assessment/${aId}/questions`);
  await page.getByRole('button', { name: 'Edit questions' }).click();
  await expect(page.locator('[aria-label="Drag to reorder"]').first()).toBeVisible();
}

test.describe('Assessment questions', () => {
  let courseInstanceId: string;
  let coursePath: string;

  test.beforeAll(async ({ testCoursePath }) => {
    coursePath = testCoursePath;
    await syncCourse(testCoursePath);
    await features.enable('assessment-questions-editor');

    const course = await selectCourseByShortName('QA 101');
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
    courseInstanceId = courseInstance.id;
  });

  // Test assessment has 2 zones:
  // Zone 1: "Questions to test maxPoints" - 1 question (partialCredit1)
  // Zone 2: "Questions to test maxPoints and bestQuestions together" - 3 questions (partialCredit2, partialCredit3, partialCredit4_v2)
  test('can drag a question between zones and save', async ({ page }) => {
    const assessmentTid = 'exam5-perZoneGrading';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstanceId, assessment.id);

    const dragHandles = page.locator('[aria-label="Drag to reorder"]');
    await expect(dragHandles).toHaveCount(4);

    // Drag second question (partialCredit2 from zone 2) to first question position (zone 1)
    await performDrag(page, dragHandles.nth(1), dragHandles.nth(0));

    // Verify all questions still present after reorder
    await expect(dragHandles).toHaveCount(4);

    // Click save
    await page.getByRole('button', { name: 'Save and sync' }).click();

    // Wait for the page to reload after save (edit mode button reappears)
    await expect(page.getByRole('button', { name: 'Edit questions' })).toBeVisible();

    // Read the saved file from disk
    const infoAssessmentPath = path.join(
      coursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    // Validate the saved zones structure
    expect(savedAssessment.zones).toEqual([
      {
        title: 'Questions to test maxPoints',
        maxPoints: 5,
        questions: [
          // partialCredit2 was dragged here from zone 2
          { id: 'partialCredit2', points: [10, 5, 1] },
          // partialCredit1 was originally here
          { id: 'partialCredit1', points: [10, 5, 1] },
        ],
      },
      {
        title: 'Questions to test maxPoints and bestQuestions together',
        bestQuestions: 2,
        maxPoints: 15,
        questions: [
          // partialCredit2 was moved out, so only these remain
          { id: 'partialCredit3', points: [15, 10, 5, 1] },
          { id: 'partialCredit4_v2', points: [20, 15, 10, 5, 1] },
        ],
      },
    ]);
  });

  // Test assessment has 2 zones:
  // Zone 1: "Questions to test maxPoints" - 1 question (partialCredit4_v2)
  // Zone 2: "Questions to test bestQuestions" - 3 questions (partialCredit1, partialCredit2, partialCredit3)
  test('can edit question points and zone settings', async ({ page }) => {
    const assessmentTid = 'hw4-perzonegrading';
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: assessmentTid,
    });

    await enterEditMode(page, courseInstanceId, assessment.id);

    // Find the row containing partialCredit1 and click its edit button
    const questionRow = page.locator('tr').filter({ hasText: 'partialCredit1' });
    await questionRow.getByRole('button', { name: 'Edit question' }).click();

    // Wait for the edit modal to appear
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Edit question')).toBeVisible();

    // Edit the points - change from "5" to "10"
    const pointsInput = modal.locator('#autoPointsInput');
    await pointsInput.clear();
    await pointsInput.fill('10');

    // Set tries per variant to a non-default value
    const triesPerVariantInput = modal.locator('#triesPerVariantInput');
    await triesPerVariantInput.clear();
    await triesPerVariantInput.fill('2');

    // Click update
    await modal.getByRole('button', { name: 'Update question' }).click();

    // Wait for modal to close
    await expect(modal).not.toBeVisible();

    // Now edit the zone's bestQuestions setting
    // Find zone 2 header row and click its edit button
    const zoneRow = page.locator('tr').filter({ hasText: 'Zone 2' });
    await zoneRow.getByRole('button', { name: 'Edit zone' }).click();

    // Wait for zone edit modal to appear
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Edit zone')).toBeVisible();

    // Change bestQuestions from 1 to 2
    const bestQuestionsInput = modal.locator('#bestQuestionsInput');
    await bestQuestionsInput.clear();
    await bestQuestionsInput.fill('2');

    // Click update
    await modal.getByRole('button', { name: 'Update zone' }).click();

    // Wait for modal to close
    await expect(modal).not.toBeVisible();

    // Click save
    await page.getByRole('button', { name: 'Save and sync' }).click();

    // Wait for the page to reload after save
    await expect(page.getByRole('button', { name: 'Edit questions' })).toBeVisible();

    // Read the saved file from disk
    const infoAssessmentPath = path.join(
      coursePath,
      'courseInstances/Sp15/assessments',
      assessmentTid,
      'infoAssessment.json',
    );
    const savedContent = await fs.readFile(infoAssessmentPath, 'utf-8');
    const savedAssessment = JSON.parse(savedContent);

    // Validate the saved zones structure
    expect(savedAssessment.zones).toEqual([
      {
        title: 'Questions to test maxPoints',
        maxPoints: 7,
        questions: [{ id: 'partialCredit4_v2', points: 4, maxPoints: 8 }],
      },
      {
        title: 'Questions to test bestQuestions',
        // bestQuestions changed from 1 to 2
        bestQuestions: 2,
        questions: [
          // partialCredit1 now has updated points and triesPerVariant
          { id: 'partialCredit1', points: 10, maxPoints: 30, triesPerVariant: 2 },
          { id: 'partialCredit2', points: 5, maxPoints: 40 },
          { id: 'partialCredit3', points: 5, maxPoints: 50 },
        ],
      },
    ]);
  });

  test('can create alternative group and drag question into it', async ({ page }) => {
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
      coursePath,
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
});
