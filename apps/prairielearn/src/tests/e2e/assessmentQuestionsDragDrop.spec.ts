import { type Locator, type Page } from '@playwright/test';

import { features } from '../../lib/features/index.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

// Test assessment has 2 zones:
// Zone 1: "Questions to test maxPoints" - 1 question (partialCredit1)
// Zone 2: "Questions to test maxPoints and bestQuestions together" - 3 questions (partialCredit2, partialCredit3, partialCredit4_v2)
const TEST_ASSESSMENT_TID = 'exam5-perZoneGrading';

let assessmentId: string;
let courseInstanceId: string;

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

test.describe('Assessment questions cross-zone drag and drop', () => {
  test.beforeAll(async ({ testCoursePath }) => {
    await syncCourse(testCoursePath);
    await features.enable('assessment-questions-editor');

    const course = await selectCourseByShortName('QA 101');
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
    courseInstanceId = courseInstance.id;

    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: TEST_ASSESSMENT_TID,
    });
    assessmentId = assessment.id;
  });

  test('can drag a question between zones', async ({ page }) => {
    await enterEditMode(page, courseInstanceId, assessmentId);

    const dragHandles = page.locator('[aria-label="Drag to reorder"]');
    await expect(dragHandles).toHaveCount(4);

    // Drag second question (zone 2) to first question position (zone 1)
    await performDrag(page, dragHandles.nth(1), dragHandles.nth(0));

    // Verify all questions still present after reorder
    await expect(dragHandles).toHaveCount(4);
    // Use a more specific selector to avoid matching the dnd-kit LiveRegion announcement
    await expect(page.locator('td').filter({ hasText: 'partialCredit2' }).first()).toBeVisible();
  });

  test('drop zones appear only while dragging', async ({ page }) => {
    await enterEditMode(page, courseInstanceId, assessmentId);

    const dragHandle = page.locator('[aria-label="Drag to reorder"]').nth(1);
    const handleBox = await dragHandle.boundingBox();
    if (!handleBox) throw new Error('Could not get drag handle bounding box');

    const zone0DropZone = page.getByTestId('zone-0-droppable');
    const zone1DropZone = page.getByTestId('zone-1-droppable');

    // Drop zones hidden before drag
    await expect(zone0DropZone).not.toBeVisible();
    await expect(zone1DropZone).not.toBeVisible();

    // Start drag (move past 6px activation threshold with intermediate steps)
    const centerX = handleBox.x + handleBox.width / 2;
    const centerY = handleBox.y + handleBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();

    // Move in steps to properly trigger dnd-kit drag events
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(centerX + (20 * i) / steps, centerY + (20 * i) / steps);
    }

    // Drop zone visible during drag
    await expect(zone0DropZone).toBeVisible({ timeout: 5000 });

    // Release drag
    await page.mouse.up();

    // Drop zone hidden after drag ends
    await expect(zone0DropZone).not.toBeVisible();
  });
});
