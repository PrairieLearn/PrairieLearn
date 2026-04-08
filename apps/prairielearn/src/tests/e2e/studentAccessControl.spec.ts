import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import {
  addLabelToEnrollment,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
import type { AccessControlJsonInput } from '../../schemas/accessControl.js';
import { syncCourse } from '../helperCourse.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const STUDENT_A = { uid: 'e2e_ac_student_a@test.com', name: 'AC Student A', uin: 'AC001' };
const STUDENT_B = { uid: 'e2e_ac_student_b@test.com', name: 'AC Student B', uin: 'AC002' };

async function impersonateUser(page: Page, uid: string, baseURL: string) {
  await page.context().addCookies([
    { name: 'pl2_requested_uid', value: uid, url: baseURL },
    { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
  ]);
}

const ASSESSMENT_TITLE = 'Access control UI tests';
const ASSESSMENT_DIR = 'courseInstances/Sp15/assessments/hw19-accessControlUi';

async function writeAssessmentConfig(
  testCoursePath: string,
  accessControl: AccessControlJsonInput[],
) {
  const configPath = path.join(testCoursePath, ASSESSMENT_DIR, 'infoAssessment.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  config.accessControl = accessControl;
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

async function selectAccessControlUiAssessmentId(courseInstanceId: string) {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstanceId,
    tid: 'hw19-accessControlUi',
  });
  return assessment.id;
}

test.describe.serial('Student access control', () => {
  // testCoursePath is worker-scoped, so in CI (where workers=1) all spec files
  // share the same temp copy. Save/restore prevents modifications from leaking
  // into other spec files that use the same worker.
  // TODO: consider having the fixture itself snapshot/restore the course directory
  // so individual spec files don't need to handle this.
  let originalConfig: string;

  test.beforeAll(async ({ testCoursePath, courseInstance }) => {
    const configPath = path.join(testCoursePath, ASSESSMENT_DIR, 'infoAssessment.json');
    originalConfig = await fs.readFile(configPath, 'utf-8');

    // Create and enroll both students
    const studentA = await getOrCreateUser(STUDENT_A);
    const studentB = await getOrCreateUser(STUDENT_B);

    const authzData = dangerousFullSystemAuthz();

    const enrollmentA = await ensureUncheckedEnrollment({
      userId: studentA.id,
      courseInstance,
      authzData,
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    await ensureUncheckedEnrollment({
      userId: studentB.id,
      courseInstance,
      authzData,
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });

    // Assign Student A to the "Section A" label
    assert(enrollmentA, 'Expected enrollment for Student A');
    const labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const sectionALabel = labels.find((l) => l.name === 'Section A');
    assert(sectionALabel, 'Expected "Section A" label to exist in course instance');
    await addLabelToEnrollment({
      enrollment: enrollmentA,
      label: sectionALabel,
      authzData,
    });
  });

  test.afterAll(async ({ testCoursePath }) => {
    const configPath = path.join(testCoursePath, ASSESSMENT_DIR, 'infoAssessment.json');
    await fs.writeFile(configPath, originalConfig);
    await syncCourse(testCoursePath);
  });

  test('rule with no releaseDate shows assessment as inactive (not clickable)', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [{}]);
    await syncCourse(testCoursePath);

    await impersonateUser(page, STUDENT_A.uid, baseURL);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    // The assessment title should be visible but not as a clickable link
    await expect(page.getByText(ASSESSMENT_TITLE, { exact: true })).toBeVisible();
    const assessmentLink = page.getByRole('link', { name: ASSESSMENT_TITLE, exact: true });
    await expect(assessmentLink).not.toBeVisible();
  });

  test('listBeforeRelease: true with future release shows grayed-out assessment', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [
      {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: '2099-06-01T00:00:00',
          dueDate: '2099-12-01T00:00:00',
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await impersonateUser(page, STUDENT_A.uid, baseURL);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    // The assessment title should be visible but not as a link
    await expect(page.getByText(ASSESSMENT_TITLE, { exact: true })).toBeVisible();
    const assessmentLink = page.getByRole('link', { name: ASSESSMENT_TITLE, exact: true });
    await expect(assessmentLink).not.toBeVisible();

    // "Not yet open" text should be visible
    await expect(page.getByText('Not yet open')).toBeVisible();
  });

  test('assessment list shows modern access details in the popover', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [
      {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: '2099-06-01T00:00:00',
          dueDate: '2099-12-01T00:00:00',
          durationMinutes: 45,
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await impersonateUser(page, STUDENT_B.uid, baseURL);
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    await page
      .getByRole('row', { name: new RegExp(ASSESSMENT_TITLE) })
      .getByRole('button', { name: 'Access details' })
      .click();
    await expect(page.getByRole('table', { name: 'Access details' })).toBeVisible();
    await expect(page.getByText('45 minutes time limit')).toBeVisible();
  });

  test('normal access shows clickable assessment link', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [
      {
        dateControl: {
          releaseDate: '2020-01-01T00:00:00',
          dueDate: '2099-01-01T00:00:00',
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await impersonateUser(page, STUDENT_A.uid, baseURL);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    const assessmentLink = page.getByRole('link', { name: ASSESSMENT_TITLE, exact: true });
    await expect(assessmentLink).toBeVisible();
    await expect(assessmentLink).toHaveAttribute('href', /\/assessment\/\d+/);
  });

  test('assessment instance page renders inline access details for modern access control', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [
      {
        dateControl: {
          releaseDate: '2020-01-01T00:00:00',
          dueDate: '2099-01-01T00:00:00',
          durationMinutes: 30,
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await impersonateUser(page, STUDENT_A.uid, baseURL);
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    await page.getByRole('link', { name: ASSESSMENT_TITLE, exact: true }).click();

    await expect(page.getByText('Access details', { exact: true })).toBeVisible();
    await expect(page.getByText('30 minutes time limit')).toBeVisible();
  });

  test('direct URL to a listed but unavailable modern assessment shows the friendly unavailable page', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [
      {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: '2099-06-01T00:00:00',
          dueDate: '2099-12-01T00:00:00',
        },
      },
    ]);
    await syncCourse(testCoursePath);
    const assessmentId = await selectAccessControlUiAssessmentId(courseInstance.id);
    await impersonateUser(page, STUDENT_B.uid, baseURL);
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessment/${assessmentId}/`);

    await expect(page.getByTestId('assessment-closed-message')).toContainText(
      'Assessment is not yet open.',
    );
    await expect(
      page.getByText("This assessment's configuration does not allow you to access it right now."),
    ).not.toBeVisible();
  });

  test('listBeforeRelease: false with future release hides assessment entirely', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [
      {
        listBeforeRelease: false,
        dateControl: {
          releaseDate: '2099-06-01T00:00:00',
          dueDate: '2099-12-01T00:00:00',
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await impersonateUser(page, STUDENT_A.uid, baseURL);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    // Assessment should not be visible at all when listBeforeRelease is false
    await expect(page.getByText(ASSESSMENT_TITLE, { exact: true })).not.toBeVisible();
  });
});
