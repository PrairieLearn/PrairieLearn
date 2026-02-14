import type { Page } from '@playwright/test';

import { insertIssue } from '../../lib/issues.js';
import { selectCourseByShortName } from '../../models/course.js';
import { updateIssueOpenStatus } from '../../models/issue.js';
import { selectQuestionByQid } from '../../models/question.js';
import { insertTestVariant } from '../../models/variant.js';
import { type AuthUser, getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const ISSUES_URL = '/pl/course/1/course_admin/issues';

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

// Test user for creating issues
const TEST_USER: AuthUser = {
  uid: 'issue_test_user@example.com',
  name: 'Issue Test User',
  uin: '123456789',
};

interface TestIssueData {
  qid: string;
  studentMessage: string;
  manuallyReported: boolean;
  open: boolean;
}

// Test issues with different characteristics
const BASE_TEST_ISSUES: TestIssueData[] = [
  {
    qid: 'addNumbers',
    studentMessage: 'Issue 1: addNumbers open manual',
    manuallyReported: true,
    open: true,
  },
  {
    qid: 'addNumbers',
    studentMessage: 'Issue 2: addNumbers closed manual',
    manuallyReported: true,
    open: false,
  },
  {
    qid: 'addVectors',
    studentMessage: 'Issue 3: addVectors open auto',
    manuallyReported: false,
    open: true,
  },
  {
    qid: 'addVectors',
    studentMessage: 'Issue 4: addVectors closed auto',
    manuallyReported: false,
    open: false,
  },
  {
    qid: 'addNumbers',
    studentMessage: 'Issue 5: addNumbers open auto',
    manuallyReported: false,
    open: true,
  },
];

async function createTestIssues() {
  // Use 'QA 101' which is the testCourse already loaded by fixtures
  const course = await selectCourseByShortName('QA 101');
  const user = await getOrCreateUser(TEST_USER);

  // Get questions by QID
  const addNumbersQuestion = await selectQuestionByQid({ qid: 'addNumbers', course_id: course.id });
  const addVectorsQuestion = await selectQuestionByQid({ qid: 'addVectors', course_id: course.id });

  const questionMap: Record<string, { id: string }> = {
    addNumbers: addNumbersQuestion,
    addVectors: addVectorsQuestion,
  };

  // Create base test issues
  for (const issueData of BASE_TEST_ISSUES) {
    const question = questionMap[issueData.qid];
    const variantId = await insertTestVariant({
      questionId: question.id,
      courseId: course.id,
      authnUserId: user.id,
      userId: user.id,
      variantSeed: `seed_${Date.now()}_${Math.random()}`,
    });

    const issueId = await insertIssue({
      variantId,
      studentMessage: issueData.studentMessage,
      instructorMessage: issueData.manuallyReported
        ? 'manually-reported issue'
        : 'automatically-reported issue',
      manuallyReported: issueData.manuallyReported,
      courseCaused: true,
      courseData: {},
      systemData: {},
      userId: user.id,
      authnUserId: user.id,
    });

    // Close the issue if needed
    if (!issueData.open) {
      await updateIssueOpenStatus({ issueId, open: false });
    }
  }
}

test.describe('Instructor issues page', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    // Sync all courses via the web UI - this syncs the testCourse (QA 101)
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();
    await createTestIssues();
  });

  test.describe('View issues list', () => {
    test('page loads with correct title and shows issues', async ({ page }) => {
      await page.goto(ISSUES_URL);
      await expect(page).toHaveTitle(/Issues/);

      // Check that open/closed counts are displayed in header
      const header = page.locator('h1');
      await expect(header).toContainText('Issues');

      // Check that issues are displayed
      const issueItems = page.locator('.list-group-item.issue-list-item');
      await expect(issueItems.first()).toBeVisible();
    });

    test('issues display QID and status badges', async ({ page }) => {
      await page.goto(ISSUES_URL);

      // Check that at least one issue shows a QID
      await expect(page.getByText('addNumbers').first()).toBeVisible();

      // Check for status icon (at least one should be visible)
      const statusIcons = page.locator('.fa-exclamation-circle, .fa-check-circle');
      await expect(statusIcons.first()).toBeVisible();

      // Verify manually-reported badge is present for at least one issue
      await expect(
        page
          .locator('.badge')
          .filter({ hasText: /reported/ })
          .first(),
      ).toBeVisible();
    });
  });

  test.describe('Filter issues', () => {
    test('can filter to show only open issues', async ({ page }) => {
      await page.goto(ISSUES_URL);

      // Click the "X open" link in the header which applies the open filter
      await page.getByRole('link', { name: /\d+ open/ }).click();

      // All visible issues should have the open (danger) icon
      await expect(page.locator('.fa-exclamation-circle.text-danger').first()).toBeVisible();

      // Should not show closed icon in filtered results
      const closedIcons = page.locator(
        '.list-group-item.issue-list-item .fa-check-circle.text-success',
      );
      await expect(closedIcons).toHaveCount(0);
    });

    test('can filter to show only closed issues', async ({ page }) => {
      await page.goto(ISSUES_URL);

      // Click the "X closed" link in the header which applies the closed filter
      await page.getByRole('link', { name: /\d+ closed/ }).click();

      // All visible issues should have the closed (success) icon
      await expect(page.locator('.fa-check-circle.text-success').first()).toBeVisible();

      // Should not show open icon in filtered results
      const openIcons = page.locator(
        '.list-group-item.issue-list-item .fa-exclamation-circle.text-danger',
      );
      await expect(openIcons).toHaveCount(0);
    });

    test('can filter to show manually-reported issues', async ({ page }) => {
      await page.goto(ISSUES_URL);

      // Open filters dropdown and click "Manually-reported issues"
      await page.getByRole('button', { name: 'Filters' }).click();
      // Wait for the dropdown to be shown (Bootstrap adds .show class)
      const dropdownMenu = page.locator('.dropdown-menu.show');
      await expect(dropdownMenu).toBeVisible();
      await dropdownMenu.getByRole('link', { name: 'Manually-reported issues' }).click();

      // Should show manually-reported issues
      await expect(page.locator('.list-group-item.issue-list-item').first()).toBeVisible();
    });

    test('can search by qid qualifier', async ({ page }) => {
      await page.goto(ISSUES_URL);

      // Enter search query
      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('qid:addVectors');
      await searchInput.press('Enter');

      // Should only show addVectors issues
      await expect(page.getByText('addVectors').first()).toBeVisible();

      // Should not show addNumbers issues in filtered list
      const issueItems = page.locator('.list-group-item.issue-list-item');
      const count = await issueItems.count();
      for (let i = 0; i < count; i++) {
        const text = await issueItems.nth(i).textContent();
        expect(text).toContain('addVectors');
      }
    });

    test('can search with wildcard qid', async ({ page }) => {
      await page.goto(ISSUES_URL);

      // Enter wildcard search query
      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('qid:add*');
      await searchInput.press('Enter');

      // Should show issues matching the wildcard pattern
      const issueItems = page.locator('.list-group-item.issue-list-item');
      await expect(issueItems.first()).toBeVisible();
    });

    test('can clear filters', async ({ page }) => {
      // Start with a filtered view
      await page.goto(`${ISSUES_URL}?q=is%3Aopen`);

      // Click clear filters button (has aria-label="Clear filters")
      await page.getByRole('link', { name: 'Clear filters' }).click();

      // Should show all issues again (both open and closed icons visible)
      await expect(page.locator('.fa-exclamation-circle.text-danger').first()).toBeVisible();
      await expect(page.locator('.fa-check-circle.text-success').first()).toBeVisible();
    });

    test('filter help modal opens', async ({ page }) => {
      await page.goto(ISSUES_URL);

      // Click the help button (question mark icon in input-group)
      await page
        .locator('.input-group button')
        .filter({ has: page.locator('.fa-question-circle') })
        .click();

      // Modal should be visible - wait for Bootstrap animation
      const modal = page.locator('#filterHelpModal.show');
      await expect(modal).toBeVisible();

      // Modal should contain filter documentation
      await expect(modal.getByText('Filter help')).toBeVisible();
    });
  });

  test.describe('Issue actions', () => {
    test('can close an open issue', async ({ page }) => {
      // Navigate to open issues
      await page.goto(`${ISSUES_URL}?q=is%3Aopen`);

      // Get the count of open issues before closing
      const openCountBefore = await page.locator('.list-group-item.issue-list-item').count();

      // Click the first close button (has aria-label="Close issue")
      await page.getByRole('button', { name: 'Close issue' }).first().click();

      // Wait for page to update and count should decrease
      await expect(page.locator('.list-group-item.issue-list-item')).toHaveCount(
        openCountBefore - 1,
      );
    });

    test('can reopen a closed issue', async ({ page }) => {
      // Navigate to closed issues
      await page.goto(`${ISSUES_URL}?q=is%3Aclosed`);

      // Get the count of closed issues before reopening
      const closedCountBefore = await page.locator('.list-group-item.issue-list-item').count();

      // Click the first reopen button (has aria-label="Reopen issue")
      await page.getByRole('button', { name: 'Reopen issue' }).first().click();

      // Wait for page to update and count should decrease
      await expect(page.locator('.list-group-item.issue-list-item')).toHaveCount(
        closedCountBefore - 1,
      );
    });

    test('can batch close matching issues', async ({ page }) => {
      await page.goto(ISSUES_URL);

      // Filter to show only open issues for a specific question
      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('qid:addNumbers is:open');
      await searchInput.press('Enter');

      // Click "Close matching issues" button
      const closeMatchingButton = page
        .locator('button')
        .filter({ hasText: 'Close matching issues' });
      await expect(closeMatchingButton).toBeVisible();
      await closeMatchingButton.click();

      // Modal should appear
      const modal = page.locator('#closeMatchingIssuesModal');
      await expect(modal).toBeVisible();

      // Confirm the batch close (button says "Close issues")
      await modal.getByRole('button', { name: 'Close issues' }).click();

      // Should show success message or return to empty filtered list
      await expect(page.locator('.list-group-item.issue-list-item')).toHaveCount(0);
    });

    test('cancel batch close modal keeps issues unchanged', async ({ page }) => {
      // Create a fresh open issue for this test
      const course = await selectCourseByShortName('QA 101');
      const user = await getOrCreateUser(TEST_USER);
      const addNumbersQuestion = await selectQuestionByQid({
        qid: 'addNumbers',
        course_id: course.id,
      });

      const variantId = await insertTestVariant({
        questionId: addNumbersQuestion.id,
        courseId: course.id,
        authnUserId: user.id,
        userId: user.id,
        variantSeed: `cancel_test_${Date.now()}`,
      });

      await insertIssue({
        variantId,
        studentMessage: 'Issue for cancel test',
        instructorMessage: 'test issue',
        manuallyReported: true,
        courseCaused: true,
        courseData: {},
        systemData: {},
        userId: user.id,
        authnUserId: user.id,
      });

      // Navigate to open issues
      await page.goto(`${ISSUES_URL}?q=is%3Aopen`);

      const countBefore = await page.locator('.list-group-item.issue-list-item').count();

      // Click "Close matching issues" button
      await page.locator('button').filter({ hasText: 'Close matching issues' }).click();

      // Modal should appear
      const modal = page.locator('#closeMatchingIssuesModal');
      await expect(modal).toBeVisible();

      // Cancel the modal
      await modal.getByRole('button', { name: 'Cancel' }).click();

      // Modal should close
      await expect(modal).not.toBeVisible();

      // Issue count should remain unchanged
      await expect(page.locator('.list-group-item.issue-list-item')).toHaveCount(countBefore);
    });
  });
});
