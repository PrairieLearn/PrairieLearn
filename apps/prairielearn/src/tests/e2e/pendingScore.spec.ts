import fs from 'node:fs/promises';
import path from 'node:path';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { syncCourse } from '../helperCourse.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

test('student and instructor see pending scores until submitted work is graded', async ({
  page,
  baseURL,
  courseInstance,
  testCoursePath,
}, testInfo) => {
  const assessmentPath = path.join(
    testCoursePath,
    'courseInstances/Sp15/assessments/hw9-internalExternalManual/infoAssessment.json',
  );
  const info: { zones: { questions: { id: string; autoPoints?: number }[] }[] } = JSON.parse(
    await fs.readFile(assessmentPath, 'utf8'),
  );
  info.zones[1].questions[0].autoPoints = 2;
  await fs.writeFile(assessmentPath, JSON.stringify(info));
  await syncCourse(testCoursePath);
  const student = await getOrCreateUser({
    uid: 'pending-score-e2e@example.com',
    name: 'Pending Score Student',
    uin: 'PENDING001',
  });
  await ensureUncheckedEnrollment({
    userId: student.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw9-internalExternalManual',
  });
  const courseUrl = `/pl/course_instance/${courseInstance.id}`;
  await page.context().addCookies([
    { name: 'pl2_requested_uid', value: student.uid, url: baseURL },
    { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
  ]);
  await page.goto(`${courseUrl}/assessment/${assessment.id}/`);
  const overviewUrl = page.url();
  const assessmentInstanceId = new URL(overviewUrl).pathname.split('/').filter(Boolean).at(-1)!;
  await page
    .getByRole('link', { name: 'Internal Grading: Adding two numbers (with manual points)' })
    .click();
  const instanceQuestionId = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1)!;
  await page.getByRole('textbox').fill('42');
  await page.getByRole('button', { name: 'Save only', exact: true }).click();
  const pendingSummary = page.getByText('Up to 11.8% pending', { exact: true });
  await expect(pendingSummary).toBeVisible();
  await pendingSummary.press('Space');
  await expect(
    page.getByText('Submitted work is awaiting grading.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Assessment overview' }).click();
  await expect(page.getByText('Up to 11.8% pending', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pending-score.png'), fullPage: true });
  await page.getByRole('link', { name: 'Gradebook', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: assessment.title! }).getByText('Up to 11.8% pending'),
  ).toBeVisible();

  await page.context().clearCookies();
  await page.goto(`${courseUrl}/instructor/assessment_instance/${assessmentInstanceId}`);
  await expect(page.getByText('Up to 11.8% pending', { exact: true })).toBeVisible();
  await page.goto(
    `${courseUrl}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${instanceQuestionId}`,
  );
  await page.getByRole('spinbutton', { name: 'Manual points' }).fill('2');
  await page.getByRole('button', { name: 'Grade', exact: true }).click();

  await page.goto(`${courseUrl}/instructor/assessment_instance/${assessmentInstanceId}`);
  await expect(page.getByText('Up to 5.9% pending', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Current score: 5.882/ })).toBeVisible();
  const instructorQuestion = page
    .getByRole('row')
    .filter({ hasText: 'internalGrade/addingNumbers2' });
  await expect(
    instructorQuestion.getByRole('cell').nth(2).getByText('pending', { exact: true }),
  ).toBeVisible();
  await expect(
    instructorQuestion.getByRole('cell').nth(3).getByTestId('awarded-points'),
  ).toHaveText('2');
  await expect(
    instructorQuestion.getByRole('cell').nth(3).getByText('pending', { exact: true }),
  ).toHaveCount(0);
  await expect(
    instructorQuestion.getByRole('cell').nth(4).getByText('pending', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('partially-graded-score.png'),
    fullPage: true,
  });

  await page.context().addCookies([
    { name: 'pl2_requested_uid', value: student.uid, url: baseURL },
    { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
  ]);
  await page.goto(`${courseUrl}/instance_question/${instanceQuestionId}/`);
  await expect(page.getByText('auto-grading: waiting for grading', { exact: true })).toBeVisible();
  await expect(page.getByText('auto-grading: 0%', { exact: true })).toHaveCount(0);
  const questionScore = page.getByRole('table', { name: 'Question score', exact: true });
  await expect(
    questionScore
      .getByRole('row')
      .filter({ hasText: 'Auto-grading:' })
      .getByText('pending', { exact: true }),
  ).toBeVisible();
  const manualScore = questionScore.getByRole('row').filter({ hasText: 'Manual grading:' });
  await expect(manualScore.getByTestId('awarded-points')).toHaveText('2');
  await expect(manualScore.getByText('pending', { exact: true })).toHaveCount(0);
  await expect(
    questionScore
      .getByRole('row')
      .filter({ hasText: 'Total points:' })
      .getByText('pending', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('partially-graded-question.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Assessment overview' }).click();
  const studentQuestion = page
    .getByRole('row')
    .filter({ hasText: 'Internal Grading: Adding two numbers (with manual points)' });
  await expect(
    studentQuestion.getByRole('cell').nth(3).getByText('pending', { exact: true }),
  ).toBeVisible();
  await expect(studentQuestion.getByRole('cell').nth(4).getByTestId('awarded-points')).toHaveText(
    '2',
  );
  await expect(
    studentQuestion.getByRole('cell').nth(4).getByText('pending', { exact: true }),
  ).toHaveCount(0);
  await expect(
    studentQuestion.getByRole('cell').nth(5).getByText('pending', { exact: true }),
  ).toBeVisible();

  await page.context().clearCookies();
  await page.goto(
    `${courseUrl}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${instanceQuestionId}`,
  );
  await page.getByRole('button', { name: 'Edit auto points', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Auto points' }).fill('2');
  await page.getByRole('button', { name: 'Grade', exact: true }).click();

  await page.context().addCookies([
    { name: 'pl2_requested_uid', value: student.uid, url: baseURL },
    { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
  ]);
  await page.goto(overviewUrl);
  await expect(page.getByTestId('scorebar').getByText(/pending/i)).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Current score: 11.764/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('graded-score.png'), fullPage: true });
});
