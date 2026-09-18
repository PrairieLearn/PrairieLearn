import type { Page } from '@playwright/test';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { createGroup } from '../../lib/groups.js';
import { selectAssessmentInstanceById } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../../models/course-permissions.js';
import { generateAndEnrollUsers } from '../../models/enrollment.js';
import { selectUserByUid } from '../../models/user.js';
import { selectAssessmentInstancesForTable } from '../../trpc/assessment/assessment-instances.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';
import { waitForJobAndCheckOutput } from './utils/job-sequence.js';

async function openAction(page: Page, action: string) {
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page
    .locator('.dropdown-menu.show')
    .getByRole('button', { name: action, exact: true })
    .click();
  return page.getByRole('dialog');
}

test('instance actions target only the current instance and preserve the Students workflow', async ({
  page,
  courseInstance,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const instructor = await selectUserByUid('dev@example.com');
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw1-automaticTestSuite',
  });
  const users = await generateAndEnrollUsers({ count: 2, course_instance_id: courseInstance.id });
  const instanceIds: string[] = [];
  for (const user of users) {
    instanceIds.push(
      await makeAssessmentInstance({
        assessment,
        user_id: user.id,
        authn_user_id: instructor.id,
        mode: 'Public',
        time_limit_min: null,
        date: new Date(),
        client_fingerprint_id: null,
      }),
    );
  }
  const [instanceId, otherInstanceId] = instanceIds;
  const instanceUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${instanceId}`;
  const instancesUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/instances`;
  await page.goto(instanceUrl);
  await expect(
    page.getByRole('table', { name: 'Assessment instance questions', exact: true }),
  ).toBeVisible();

  const deleteDialog = await openAction(page, 'Delete');
  await expect(deleteDialog.getByText('this assessment instance', { exact: true })).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(deleteDialog).toBeHidden();
  expect((await selectAssessmentInstanceById(instanceId)).id).toBe(instanceId);

  for (const action of ['Grade', 'Regrade']) {
    const dialog = await openAction(page, action);
    await expect(dialog.getByText('this instance', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: action, exact: true }).click();
    await waitForJobAndCheckOutput(page, [], 15_000);
    await page.goto(instanceUrl);
  }

  const closeDialog = await openAction(page, 'Grade & close');
  await closeDialog.getByRole('button', { name: 'Grade and close', exact: true }).click();
  await waitForJobAndCheckOutput(page, [], 15_000);
  expect((await selectAssessmentInstanceById(instanceId)).open).toBe(false);
  expect((await selectAssessmentInstanceById(otherInstanceId)).open).toBe(true);
  await page.goto(instanceUrl);

  const reopenDialog = await openAction(page, 'Change time limit');
  await expect(
    reopenDialog.getByRole('heading', { name: 'Re-open instance', exact: true }),
  ).toBeVisible();
  await expect(
    reopenDialog.getByLabel('Re-open without time limit', { exact: true }),
  ).toBeChecked();
  await Promise.all([
    page.waitForEvent('load'),
    reopenDialog.getByRole('button', { name: 'Set', exact: true }).click(),
  ]);
  await expect(reopenDialog).toBeHidden();
  await expect.poll(async () => (await selectAssessmentInstanceById(instanceId)).open).toBe(true);

  const timeDialog = await openAction(page, 'Change time limit');
  await timeDialog.getByLabel('Time limit options').selectOption('set_rem');
  await timeDialog.getByLabel('Time value').fill('30');
  await Promise.all([
    page.waitForEvent('load'),
    timeDialog.getByRole('button', { name: 'Set', exact: true }).click(),
  ]);
  await expect(timeDialog).toBeHidden();
  await expect
    .poll(async () => (await selectAssessmentInstanceById(instanceId)).date_limit)
    .not.toBeNull();
  expect((await selectAssessmentInstanceById(otherInstanceId)).date_limit).toBeNull();
  await expect(
    page.getByRole('grid', { name: 'Assessment instance log', exact: true }),
  ).toContainText('30m');

  const confirmedDeleteDialog = await openAction(page, 'Delete');
  await confirmedDeleteDialog.getByRole('button', { name: 'Delete instance', exact: true }).click();
  await expect(page).toHaveURL(instancesUrl);
  await expect(
    page.getByRole('checkbox', { name: `Select instance ${instanceId}`, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('checkbox', { name: `Select instance ${otherInstanceId}`, exact: true })
    .check();

  const bulkTimeDialog = await openAction(page, 'Change time limit');
  await expect(bulkTimeDialog.getByText('1 instance selected', { exact: true })).toBeVisible();
  await bulkTimeDialog.getByLabel('Time limit options').selectOption('set_rem');
  await bulkTimeDialog.getByLabel('Time value').fill('15');
  await bulkTimeDialog.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Updated the time limit for 1 instance.');
  await expect(
    page.getByRole('checkbox', { name: `Select instance ${otherInstanceId}`, exact: true }),
  ).not.toBeChecked();
  expect((await selectAssessmentInstanceById(otherInstanceId)).date_limit).not.toBeNull();

  const allDialog = await openAction(page, 'Grade');
  await expect(
    allDialog.getByRole('heading', { name: 'Grade all instances', exact: true }),
  ).toBeVisible();
  await allDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const remaining = await selectAssessmentInstancesForTable({
    assessment_id: assessment.id,
    assessment_instance_id: instanceId,
    timezone: courseInstance.display_timezone,
  });
  expect(remaining).toEqual([]);
});

test('group instance actions target the group assessment instance', async ({
  page,
  courseInstance,
}) => {
  await page.goto('/');
  const instructor = await selectUserByUid('dev@example.com');
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw6-templateGroupWork2',
  });
  const users = await generateAndEnrollUsers({ count: 2, course_instance_id: courseInstance.id });
  const group = await createGroup({
    course_instance: courseInstance,
    assessment,
    group_name: 'ActionsGroup',
    uids: users.map((user) => user.uid),
    authn_user_id: instructor.id,
    authzData: dangerousFullSystemAuthz(),
  });
  const instanceId = await makeAssessmentInstance({
    assessment,
    user_id: users[0].id,
    authn_user_id: instructor.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const instanceUrl = `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${instanceId}`;
  await page.goto(instanceUrl);
  await expect(
    page.getByRole('table', { name: 'Assessment instance summary', exact: true }),
  ).toContainText(group.name);
  const dialog = await openAction(page, 'Grade & close');
  await expect(dialog.getByText('this instance', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Grade and close', exact: true }).click();
  await waitForJobAndCheckOutput(page, [], 15_000);
  const instance = await selectAssessmentInstanceById(instanceId);
  expect(instance.open).toBe(false);
  expect(instance.team_id).toBe(group.id);
});

test('student data viewers can inspect an instance without action controls', async ({
  page,
  courseInstance,
  baseURL,
}) => {
  await page.goto('/');
  const admin = await selectUserByUid('dev@example.com');
  await getOrCreateUser({
    uid: 'instructor@example.com',
    name: 'Instructor User',
    uin: '100000000',
  });
  const instructor = await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: 'instructor@example.com',
    course_role: 'None',
    authn_user_id: admin.id,
  });
  await insertCourseInstancePermissions({
    course_id: courseInstance.course_id,
    course_instance_id: courseInstance.id,
    user_id: instructor.id,
    course_instance_role: 'Student Data Viewer',
    authn_user_id: admin.id,
  });
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw1-automaticTestSuite',
  });
  const [student] = await generateAndEnrollUsers({
    count: 1,
    course_instance_id: courseInstance.id,
  });
  const instanceId = await makeAssessmentInstance({
    assessment,
    user_id: student.id,
    authn_user_id: admin.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  await page.context().clearCookies();
  await page
    .context()
    .addCookies([{ name: 'pl_test_user', value: 'test_instructor', url: baseURL }]);
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment_instance/${instanceId}`,
  );
  await expect(
    page.getByRole('table', { name: 'Assessment instance summary', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions', exact: true })).toHaveCount(0);
});
