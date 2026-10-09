import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { insertIssue } from '../../lib/issues.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { selectQuestionByQid } from '../../models/question.js';
import { type AuthUser, getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function closeIssue(issueId: string) {
  await sqldb.execute(sql.close_issue, { issue_id: issueId });
}

async function insertTestVariant({
  questionId,
  courseId,
  courseInstanceId,
  instanceQuestionId,
  authnUserId,
  userId,
}: {
  questionId: string;
  courseId: string;
  courseInstanceId?: string;
  instanceQuestionId?: string;
  authnUserId: string;
  userId: string;
}) {
  return await sqldb.queryScalar(
    sql.insert_test_variant,
    {
      question_id: questionId,
      course_id: courseId,
      course_instance_id: courseInstanceId ?? null,
      instance_question_id: instanceQuestionId ?? null,
      authn_user_id: authnUserId,
      user_id: userId,
      variant_seed: 'test_seed',
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
  /** Which course instance (if any) the issue should be associated with. */
  courseInstance?: 'Sp15' | 'public';
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
  {
    qid: 'addNumbers',
    studentMessage: 'Issue 6: addNumbers in Sp15 course instance',
    manuallyReported: true,
    open: true,
    courseInstance: 'Sp15',
  },
  {
    qid: 'addVectors',
    studentMessage: 'Issue 7: addVectors in public course instance',
    manuallyReported: true,
    open: true,
    courseInstance: 'public',
  },
];

async function createTestIssues({
  courseId,
  courseInstanceIdMap,
}: {
  courseId: string;
  courseInstanceIdMap: Record<NonNullable<TestIssueData['courseInstance']>, string>;
}) {
  const user = await getOrCreateUser(TEST_USER);

  const addNumbersQuestion = await selectQuestionByQid({ qid: 'addNumbers', course_id: courseId });
  const addVectorsQuestion = await selectQuestionByQid({ qid: 'addVectors', course_id: courseId });

  const questionMap: Record<string, { id: string }> = {
    addNumbers: addNumbersQuestion,
    addVectors: addVectorsQuestion,
  };

  for (const issueData of BASE_TEST_ISSUES) {
    const question = questionMap[issueData.qid];
    const variantId = await insertTestVariant({
      questionId: question.id,
      courseId,
      courseInstanceId: issueData.courseInstance
        ? courseInstanceIdMap[issueData.courseInstance]
        : undefined,
      authnUserId: user.id,
      userId: user.id,
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

  let issuesUrl: string;

  test.beforeAll(async ({ courseInstance }) => {
    issuesUrl = `/pl/course/${courseInstance.course_id}/course_admin/issues`;

    const course = await selectCourseByShortName('QA 101');
    const publicCourseInstance = await selectCourseInstanceByShortName({
      course,
      shortName: 'public',
    });

    await createTestIssues({
      courseId: courseInstance.course_id,
      courseInstanceIdMap: { Sp15: courseInstance.id, public: publicCourseInstance.id },
    });
  });

  test.describe('View issues list', () => {
    test('page loads with correct title and shows issues', async ({ page }) => {
      await page.goto(issuesUrl);
      await expect(page).toHaveTitle(/Issues/);

      await expect(page.getByRole('heading', { level: 1 })).toContainText('Issues');

      const issueItems = page.getByTestId('issue-list-item');
      await expect(issueItems.first()).toBeVisible({ timeout: 10_000 });
    });

    test('issues display QID and status badges', async ({ page }) => {
      await page.goto(issuesUrl);

      await expect(page.getByText('addNumbers').first()).toBeVisible();
      await expect(page.getByTestId(/issue-status-(open|closed)/).first()).toBeVisible();
      await expect(
        page.getByText(/Manually reported|Automatically reported/).first(),
      ).toBeVisible();
    });
  });

  test.describe('Filter issues', () => {
    test('can filter to show only open issues', async ({ page }) => {
      await page.goto(issuesUrl);

      await page.getByRole('link', { name: /\d+ open/ }).click();
      await expect(page.getByTestId('issue-status-open').first()).toBeVisible();
      await expect(page.getByTestId('issue-status-closed')).toHaveCount(0);
    });

    test('can filter to show only closed issues', async ({ page }) => {
      await page.goto(issuesUrl);

      await page.getByRole('link', { name: /\d+ closed/ }).click();
      await expect(page.getByTestId('issue-status-closed').first()).toBeVisible();
      await expect(page.getByTestId('issue-status-open')).toHaveCount(0);
    });

    test('can filter to show manually-reported issues', async ({ page }) => {
      await page.goto(issuesUrl);

      await page.getByRole('button', { name: 'Filters' }).click();
      await page.getByRole('link', { name: 'Manually-reported issues' }).click();
      await expect(page.getByTestId('issue-list-item').first()).toBeVisible();
    });

    test('can search by qid qualifier', async ({ page }) => {
      await page.goto(issuesUrl);

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
      await page.goto(issuesUrl);

      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('qid:add*');
      await searchInput.press('Enter');

      const issueItems = page.getByTestId('issue-list-item');
      await expect(issueItems.first()).toBeVisible();
    });

    test('excluding both known qids returns no issues', async ({ page }) => {
      await page.goto(issuesUrl);

      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('-qid:addVectors -qid:addNumbers');
      await searchInput.press('Enter');

      await expect(page.getByTestId('issue-list-item')).toHaveCount(0);
    });

    test('can search by ci qualifier for a course instance', async ({ page }) => {
      await page.goto(issuesUrl);

      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('ci:Sp15');
      await searchInput.press('Enter');

      const issueItems = page.getByTestId('issue-list-item');
      await expect(issueItems).toHaveCount(1);
      await expect(issueItems.first()).toContainText('Issue 6:');
    });

    test('can search with wildcard ci qualifier', async ({ page }) => {
      await page.goto(issuesUrl);

      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('ci:Sp*');
      await searchInput.press('Enter');

      const issueItems = page.getByTestId('issue-list-item');
      await expect(issueItems).toHaveCount(1);
      await expect(issueItems.first()).toContainText('Issue 6:');
    });

    test('excluding a course instance includes issues without one or in other course instances', async ({
      page,
    }) => {
      await page.goto(issuesUrl);

      const searchInput = page.getByRole('textbox', { name: 'Search all issues' });
      await searchInput.fill('-ci:Sp15');
      await searchInput.press('Enter');

      await expect(page.getByText('Issue 1:', { exact: false })).toBeVisible();
      await expect(page.getByText('Issue 7:', { exact: false })).toBeVisible();

      const issueItems = page.getByTestId('issue-list-item');
      const count = await issueItems.count();
      for (let i = 0; i < count; i++) {
        const text = await issueItems.nth(i).textContent();
        expect(text).not.toContain('Issue 6:');
      }
    });

    test('can clear filters', async ({ page }) => {
      await page.goto(`${issuesUrl}?q=is%3Aopen`);
      await page.getByRole('link', { name: 'Clear filters' }).click();
      await expect(page.getByTestId('issue-status-open').first()).toBeVisible();
      await expect(page.getByTestId('issue-status-closed').first()).toBeVisible();
    });

    test('filter help modal opens', async ({ page }) => {
      await page.goto(issuesUrl);

      await page.getByRole('button', { name: 'Filter help' }).click();

      const modal = page.getByRole('dialog', { name: 'Filter help' });
      await expect(modal).toBeVisible();
      await expect(modal.getByText('Filter help')).toBeVisible();
    });
  });

  test.describe('Issue actions', () => {
    test('can close an open issue', async ({ page }) => {
      await page.goto(`${issuesUrl}?q=is%3Aopen`);
      const openCountBefore = await page.getByTestId('issue-list-item').count();
      await page.getByRole('button', { name: 'Close issue' }).first().click();
      await expect(page.getByTestId('issue-list-item')).toHaveCount(openCountBefore - 1);
    });

    test('can reopen a closed issue', async ({ page }) => {
      await page.goto(`${issuesUrl}?q=is%3Aclosed`);
      const closedCountBefore = await page.getByTestId('issue-list-item').count();
      await page.getByRole('button', { name: 'Reopen issue' }).first().click();
      await expect(page.getByTestId('issue-list-item')).toHaveCount(closedCountBefore - 1);
    });

    test('can batch close matching issues', async ({ page }) => {
      await page.goto(issuesUrl);

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

    test('cancel batch close modal keeps issues unchanged', async ({ page, courseInstance }) => {
      const user = await getOrCreateUser(TEST_USER);
      const addNumbersQuestion = await selectQuestionByQid({
        qid: 'addNumbers',
        course_id: courseInstance.course_id,
      });

      const variantId = await insertTestVariant({
        questionId: addNumbersQuestion.id,
        courseId: courseInstance.course_id,
        authnUserId: user.id,
        userId: user.id,
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

      await page.goto(`${issuesUrl}?q=is%3Aopen`);
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

test('shows a safe label and only an instructor link for deleted assessments', async ({
  page,
  courseInstance,
}) => {
  const user = await getOrCreateUser(TEST_USER);
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam1-automaticTestSuite',
  });
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: courseInstance.course_id,
  });
  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const instanceQuestionId = await sqldb.queryScalar(
    sql.select_instance_question_id,
    {
      assessment_instance_id: assessmentInstanceId,
      question_id: question.id,
    },
    IdSchema,
  );
  const variantId = await insertTestVariant({
    questionId: question.id,
    courseId: courseInstance.course_id,
    courseInstanceId: courseInstance.id,
    instanceQuestionId,
    authnUserId: user.id,
    userId: user.id,
  });
  const issueId = await insertIssue({
    variantId,
    studentMessage: 'Issue on deleted assessment',
    instructorMessage: 'test issue for deleted assessment',
    manuallyReported: true,
    courseCaused: true,
    courseData: {},
    systemData: {},
    userId: user.id,
    authnUserId: user.id,
  });
  const deletedAt = new Date();
  const originalAssessmentState = {
    assessment_id: assessment.id,
    assessment_set_id: assessment.assessment_set_id,
    deleted_at: assessment.deleted_at,
    tid: assessment.tid,
  };

  try {
    await sqldb.execute(sql.set_assessment_state, {
      ...originalAssessmentState,
      deleted_at: deletedAt,
    });
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/issues`);

    const issueItem = page
      .getByTestId('issue-list-item')
      .filter({ hasText: `#${issueId} reported` });
    await expect(issueItem.getByText('E1 (deleted)')).toBeVisible();
    await expect(issueItem.getByRole('link', { name: 'instructor view' })).toHaveAttribute(
      'href',
      new RegExp(`\\?variant_id=${variantId}$`),
    );
    await expect(
      issueItem.getByRole('link', {
        name: /student view|manual grading|assessment details/,
      }),
    ).toHaveCount(0);

    await sqldb.execute(sql.set_assessment_state, {
      ...originalAssessmentState,
      assessment_set_id: null,
      deleted_at: deletedAt,
    });
    await page.reload();
    await expect(issueItem.getByText('exam1-automaticTestSuite (deleted)')).toBeVisible();

    await sqldb.execute(sql.set_assessment_state, {
      ...originalAssessmentState,
      assessment_set_id: null,
      deleted_at: deletedAt,
      tid: null,
    });
    await page.reload();
    await expect(issueItem.getByText('Unknown assessment (deleted)')).toBeVisible();
  } finally {
    await sqldb.execute(sql.set_assessment_state, originalAssessmentState);
  }
});
