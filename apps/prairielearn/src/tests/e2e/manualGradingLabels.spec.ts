import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { selectAssessmentQuestionById } from '../../models/assessment-question.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { insertCourseInstancePermissions } from '../../models/course-permissions.js';
import {
  generateAndEnrollUsers,
  selectOptionalEnrollmentByUserId,
} from '../../models/enrollment.js';
import {
  addLabelToEnrollment,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
import { selectInstanceQuestionsForManualGrading } from '../../pages/instructorAssessmentManualGrading/assessmentQuestion/queries.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

test('manual grading label visibility, filtering, and assignment', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(120_000);
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw10-aiGrading',
  });
  const assessmentQuestionId = await sqldb.queryScalar(
    sql.select_assessment_question,
    { assessment_id: assessment.id },
    IdSchema,
  );
  const assessmentQuestion = await selectAssessmentQuestionById(assessmentQuestionId);
  const students = await generateAndEnrollUsers({
    count: 4,
    course_instance_id: courseInstance.id,
  });
  const labels = await selectStudentLabelsInCourseInstance(courseInstance);
  const section = labels.find((label) => label.name === 'Section A')!;
  const extraTime = labels.find((label) => label.name === 'Extra time')!;
  const memberships = [[section], [extraTime], [section, extraTime], []];
  for (const [index, student] of students.entries()) {
    const enrollment = await selectOptionalEnrollmentByUserId({
      userId: student.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    for (const label of memberships[index]) {
      await addLabelToEnrollment({
        enrollment: enrollment!,
        label,
        authzData: dangerousFullSystemAuthz(),
      });
    }
    await sqldb.execute(sql.insert_instance_question, {
      assessment_id: assessment.id,
      assessment_question_id: assessmentQuestionId,
      user_id: student.id,
    });
  }
  const grader = await getOrCreateUser({
    uid: 'label-grader@example.com',
    name: 'Label grader',
    uin: 'label-grader',
  });
  await insertCourseInstancePermissions({
    course_id: courseInstance.course_id,
    course_instance_id: courseInstance.id,
    user_id: grader.id,
    course_instance_role: 'Student Data Editor',
    authn_user_id: grader.id,
  });

  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/manual_grading/assessment_question/${assessmentQuestionId}`,
  );
  const table = page.getByRole('grid', { name: 'Student instance questions' });
  const labelHeader = table.getByRole('columnheader').filter({ hasText: 'Labels' });
  await expect(page.getByText('Showing 4 of 4 submissions', { exact: true })).toBeVisible();
  await expect(labelHeader).toHaveCount(0);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show student info', exact: true }).check();
  await expect(labelHeader).toBeVisible();
  await page.getByRole('checkbox', { name: 'Show student info', exact: true }).uncheck();
  await expect(labelHeader).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show student info', exact: true }).check();
  await page.getByRole('button', { name: 'View', exact: true }).click();

  await page.getByRole('button', { name: 'Filter labels', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search labels' }).fill('Section');
  await expect(page.getByRole('checkbox', { name: 'Extra time', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Section A', exact: true }).check();
  await expect(page.getByText('Showing 2 of 4 submissions', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search labels' }).fill('');
  await page.getByRole('checkbox', { name: 'Extra time', exact: true }).check();
  await expect(page.getByText('Showing 3 of 4 submissions', { exact: true })).toBeVisible();
  await page.getByText('Exclude', { exact: true }).click();
  await expect(page.getByText('Showing 1 of 4 submissions', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(table.getByRole('link', { name: students[3].uid, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`student_labels=!${section.id},${extraTime.id}`));
  await page.reload();
  await expect(page.getByText('Showing 1 of 4 submissions', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByText('Showing 4 of 4 submissions', { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/student_labels=/);

  // Keep hidden rows selected to verify bulk assignment uses the filtered selection.
  await table.getByRole('columnheader').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Filter labels', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Section A', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Showing 2 of 4 submissions', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tag for grading', exact: true }).click();
  await page
    .getByRole('button', { name: `Assign to: ${grader.name} (${grader.uid})`, exact: true })
    .click();
  await expect
    .poll(async () => {
      const rows = await selectInstanceQuestionsForManualGrading({
        assessment,
        assessment_question: assessmentQuestion,
      });
      return rows
        .map((row) => ({ userId: row.user!.id, graderId: row.assigned_grader?.id ?? null }))
        .sort((a, b) => Number(a.userId) - Number(b.userId));
    })
    .toEqual(
      students
        .map((student, index) => ({
          userId: student.id,
          graderId: memberships[index].includes(section) ? grader.id : null,
        }))
        .sort((a, b) => Number(a.userId) - Number(b.userId)),
    );
});

test('group manual grading omits student labels', async ({ page, courseInstance }) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam14-groupWork',
  });
  const assessmentQuestionId = await sqldb.queryScalar(
    sql.select_assessment_question,
    { assessment_id: assessment.id },
    IdSchema,
  );
  await sqldb.execute(sql.insert_group_instance_question, {
    course_instance_id: courseInstance.id,
    assessment_id: assessment.id,
    assessment_question_id: assessmentQuestionId,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/manual_grading/assessment_question/${assessmentQuestionId}?columns=select,index,user_or_group_name,uid,student_labels&student_labels=1`,
  );
  const table = page.getByRole('grid', { name: 'Student instance questions' });
  await expect(page.getByText('Showing 1 of 1 submission', { exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader').filter({ hasText: 'Labels' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filter labels', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const studentInfo = page.getByRole('checkbox', { name: 'Show student info', exact: true });
  await studentInfo.check();
  await expect(studentInfo).toBeChecked();
  await studentInfo.uncheck();
  await expect(table.getByRole('columnheader').filter({ hasText: 'Group name' })).toHaveCount(0);
  await studentInfo.check();
  await expect(studentInfo).toBeChecked();
  await expect(table.getByRole('columnheader').filter({ hasText: 'Group name' })).toBeVisible();
  await expect(table.getByRole('columnheader').filter({ hasText: 'Labels' })).toHaveCount(0);
});
