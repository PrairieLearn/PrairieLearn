import type { Page } from '@playwright/test';
import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import type { CourseInstance } from '../../lib/db-types.js';
import { selectAssessmentQuestionById } from '../../models/assessment-question.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { updateInstanceQuestions } from '../../pages/instructorAssessmentManualGrading/assessmentQuestion/queries.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const sql = loadSqlEquiv(import.meta.url);

async function signInAsStudent(page: Page, baseURL: string, courseInstance: CourseInstance) {
  const student = await getOrCreateUser({
    uid: 'grading-pending@example.com',
    name: 'Grading Pending Student',
    uin: 'PENDING001',
  });
  await ensureUncheckedEnrollment({
    userId: student.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });
  const cookies = [
    { name: 'pl2_requested_uid', value: student.uid, url: baseURL },
    { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
  ];
  await page.context().addCookies(cookies);
  return cookies;
}

test('students see overall pending status for saved answers and manual grading', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  test.setTimeout(60_000);
  const cookies = await signInAsStudent(page, baseURL, courseInstance);
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw9-internalExternalManual',
  });
  const courseUrl = `/pl/course_instance/${courseInstance.id}`;
  await page.goto(`${courseUrl}/assessment/${assessment.id}/`);
  const overviewUrl = page.url();
  await expect(page.getByText('Grading pending', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: /Internal Grading: Adding two numbers$/ }).click();
  await page.getByRole('textbox').fill('42');
  await page.getByRole('button', { name: 'Save only', exact: true }).click();
  const assessmentScore = page.getByRole('table', { name: 'Assessment score', exact: true });
  await expect(assessmentScore.getByText('Grading pending', { exact: true })).toBeVisible();
  await assessmentScore.getByRole('button', { name: 'Grading pending', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Grading pending' })).toContainText(
    'You have saved answers that you have not submitted for grading.',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Save & Grade/ }).click();
  await expect(assessmentScore.getByText('Grading pending', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Assessment overview', exact: true }).click();
  await page
    .getByRole('link', { name: 'Internal Grading: Adding two numbers (with manual points)' })
    .click();
  const questionId = /\/instance_question\/(\d+)/.exec(page.url())![1];
  await page.getByRole('textbox').fill('42');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page
      .getByRole('table', { name: 'Assessment score', exact: true })
      .getByText('Grading pending', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Assessment overview', exact: true }).click();
  await expect(page.getByText('Grading pending', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scorebar')).toHaveText('0%');
  await page.getByRole('button', { name: 'Grading pending', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Grading pending' })).toContainText(
    'Some answers are waiting for manual grading.',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Assessments', exact: true }).click();
  const assessmentRow = page.getByRole('row').filter({ hasText: assessment.title! });
  await expect(assessmentRow.getByText('Grading pending', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Gradebook', exact: true }).click();
  await expect(assessmentRow.getByText('Grading pending', { exact: true })).toBeVisible();

  await page.context().clearCookies();
  await page.goto(
    `${courseUrl}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${questionId}`,
  );
  await page.getByRole('spinbutton', { name: 'Manual points:', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Grade', exact: true }).click();
  await page.context().addCookies(cookies);
  await page.goto(overviewUrl);
  await expect(page.getByText('Grading pending', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('scorebar')).toBeVisible();
});

test('saved work with real-time grading disabled shows pending only where a score is shown', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  await signInAsStudent(page, baseURL, courseInstance);
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam8-disableRealTimeGrading',
  });
  await page.goto(`/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}/`);
  await page.getByRole('checkbox', { name: 'I certify and pledge the above.' }).check();
  await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
  const overviewUrl = page.url();
  const assessmentInstanceId = /\/assessment_instance\/(\d+)/.exec(overviewUrl)![1];
  const question = await queryRow(
    sql.select_question,
    { assessment_instance_id: assessmentInstanceId, qid: 'addNumbers' },
    z.object({ id: IdSchema, assessment_question_id: IdSchema }),
  );
  await page.locator(`a[href$="/instance_question/${question.id}/"]`).click();
  await expect(page.getByRole('button', { name: 'Save & Grade', exact: true })).toHaveCount(0);
  await page.getByRole('textbox').fill('42');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.goto(overviewUrl);
  await expect(page.getByTestId('scorebar')).toHaveCount(0);
  await expect(page.getByText('Grading pending', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Assessments', exact: true }).click();
  const assessmentRow = page.getByRole('row').filter({ hasText: assessment.title! });
  await assessmentRow.getByRole('button', { name: 'Grading pending', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Grading pending' })).toContainText(
    'Your saved answers will be graded when you finish the assessment.',
  );
  await page.keyboard.press('Escape');
  await page.goto(overviewUrl);

  await updateInstanceQuestions({
    assessment_question: await selectAssessmentQuestionById(question.assessment_question_id),
    instance_question_ids: [question.id],
    update_requires_manual_grading: true,
    requires_manual_grading: true,
    update_assigned_grader: false,
    assigned_grader: null,
  });
  await page.getByRole('button', { name: 'Finish assessment', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Finish assessment', exact: true })
    .click();
  await expect(page.getByTestId('assessment-closed-message')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Questions', exact: true })).toHaveCount(0);
  await expect(page.getByText('Grading pending', { exact: true })).toBeVisible();
});
