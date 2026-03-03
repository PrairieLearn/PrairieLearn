import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { insertIssue } from '../../lib/issues.js';
import { selectCourseByShortName } from '../../models/course.js';
import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';
import { type AuthUser, getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const ISSUES_URL = '/pl/course/1/course_admin/issues';

async function closeIssue(issueId: string) {
  await sqldb.execute(sql.close_issue, { issue_id: issueId });
}

async function insertTestVariant({
  questionId,
  courseId,
  authnUserId,
  userId,
  variantSeed,
}: {
  questionId: string;
  courseId: string;
  authnUserId: string;
  userId: string;
  variantSeed?: string;
}) {
  return await sqldb.queryRow(
    sql.insert_test_variant,
    {
      question_id: questionId,
      course_id: courseId,
      authn_user_id: authnUserId,
      user_id: userId,
      variant_seed: variantSeed ?? `test_seed_${Date.now()}`,
    },
    IdSchema,
  );
}

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
  const course = await selectCourseByShortName('QA 101');
  const user = await getOrCreateUser(TEST_USER);

  const addNumbersQuestion = await selectQuestionByQid({ qid: 'addNumbers', course_id: course.id });
  const addVectorsQuestion = await selectQuestionByQid({ qid: 'addVectors', course_id: course.id });

  const questionMap: Record<string, { id: string }> = {
    addNumbers: addNumbersQuestion,
    addVectors: addVectorsQuestion,
  };

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

    if (!issueData.open) {
      await closeIssue(issueId);
    }
  }
}

test.describe('Instructor issues page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ testCoursePath }) => {
    await syncCourse(testCoursePath);
    await createTestIssues();
  });

  test.describe('View issues list', () => {
    test('page loads with correct title and shows issues', async ({ page }) => {
      await page.goto(ISSUES_URL);
      await expect(page).toHaveTitle(/Issues/);

      await expect(page.getByRole('heading', { level: 1 })).toContainText('Issues');

      const issueItems = page.getByTestId('issue-list-item');
      await expect(issueItems.first()).toBeVisible({ timeout: 10_000 });
    });

    test('issues display QID and status badges', async ({ page }) => {
      await page.goto(ISSUES_URL);

      await expect(page.getByText('addNumbers').first()).toBeVisible();
      await expect(page.getByTestId(/issue-status-(open|closed)/).first()).toBeVisible();
      await expect(
        page.getByText(/Manually reported|Automatically reported/).first(),
      ).toBeVisible();
    });
  });

  test.describe('Filter issues', () => {
    test('can filter to show only open issues', async ({ page }) => {
      await page.goto(ISSUES_URL);

      await page.getByRole('link', { name: /\d+ open/ }).click();
      await expect(page.getByTestId('issue-status-open').first()).toBeVisible();
      await expect(page.getByTestId('issue-status-closed')).toHaveCount(0);
    });

    test('can filter to show only closed issues', async ({ page }) => {
      await page.goto(ISSUES_URL);

      await page.getByRole('link', { name: /\d+ closed/ }).click();
      await expect(page.getByTestId('issue-status-closed').first()).toBeVisible();
      await expect(page.getByTestId('issue-status-open')).toHaveCount(0);
    });

    test('can filter to show manually-reported issues', async ({ page }) => {
      await page.goto(ISSUES_URL);

      await page.getByRole('button', { name: 'Filters' }).click();
      await page.getByRole('link', { name: 'Manually-reported issues' }).click();
      await expect(page.getByTestId('issue-list-item').first()).toBeVisible();
    });

    test('can search by qid qualifier', async ({ page }) => {
      await page.goto(ISSUES_URL);

      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('qid:addVectors');
      await searchInput.press('Enter');

      await expect(page.getByText('addVectors').first()).toBeVisible();
      const issueItems = page.getByTestId('issue-list-item');
      const count = await issueItems.count();
      for (let i = 0; i < count; i++) {
        const text = await issueItems.nth(i).textContent();
        expect(text).toContain('addVectors');
      }
    });

    test('can search with wildcard qid', async ({ page }) => {
      await page.goto(ISSUES_URL);

      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('qid:add*');
      await searchInput.press('Enter');

      const issueItems = page.getByTestId('issue-list-item');
      await expect(issueItems.first()).toBeVisible();
    });

    test('can clear filters', async ({ page }) => {
      await page.goto(`${ISSUES_URL}?q=is%3Aopen`);
      await page.getByRole('link', { name: 'Clear filters' }).click();
      await expect(page.getByTestId('issue-status-open').first()).toBeVisible();
      await expect(page.getByTestId('issue-status-closed').first()).toBeVisible();
    });

    test('filter help modal opens', async ({ page }) => {
      await page.goto(ISSUES_URL);

      await page.getByRole('button', { name: 'Filter help' }).click();

      const modal = page.getByRole('dialog', { name: 'Filter help' });
      await expect(modal).toBeVisible();
      await expect(modal.getByText('Filter help')).toBeVisible();
    });
  });

  test.describe('Issue actions', () => {
    test('can close an open issue', async ({ page }) => {
      await page.goto(`${ISSUES_URL}?q=is%3Aopen`);
      const openCountBefore = await page.getByTestId('issue-list-item').count();
      await page.getByRole('button', { name: 'Close issue' }).first().click();
      await expect(page.getByTestId('issue-list-item')).toHaveCount(openCountBefore - 1);
    });

    test('can reopen a closed issue', async ({ page }) => {
      await page.goto(`${ISSUES_URL}?q=is%3Aclosed`);
      const closedCountBefore = await page.getByTestId('issue-list-item').count();
      await page.getByRole('button', { name: 'Reopen issue' }).first().click();
      await expect(page.getByTestId('issue-list-item')).toHaveCount(closedCountBefore - 1);
    });

    test('can batch close matching issues', async ({ page }) => {
      await page.goto(ISSUES_URL);

      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('qid:addNumbers is:open');
      await searchInput.press('Enter');

      const closeMatchingButton = page.getByRole('button', { name: 'Close matching issues' });
      await expect(closeMatchingButton).toBeVisible();
      await closeMatchingButton.click();

      const modal = page.getByRole('dialog', { name: 'Close matching issues' });
      await expect(modal).toBeVisible();
      await modal.getByRole('button', { name: 'Close issues' }).click();
      await expect(page.getByTestId('issue-list-item')).toHaveCount(0);
    });

    test('cancel batch close modal keeps issues unchanged', async ({ page }) => {
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

      await page.goto(`${ISSUES_URL}?q=is%3Aopen`);
      const countBefore = await page.getByTestId('issue-list-item').count();

      await page.getByRole('button', { name: 'Close matching issues' }).click();
      const modal = page.getByRole('dialog', { name: 'Close matching issues' });
      await expect(modal).toBeVisible();

      await modal.getByRole('button', { name: 'Cancel' }).click();
      await expect(modal).not.toBeVisible();
      await expect(page.getByTestId('issue-list-item')).toHaveCount(countBefore);
    });
  });
});
