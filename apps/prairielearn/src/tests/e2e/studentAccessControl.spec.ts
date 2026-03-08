import fs from 'node:fs/promises';
import path from 'node:path';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import {
  addLabelToEnrollment,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
import { syncCourse } from '../helperCourse.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const STUDENT_A = { uid: 'e2e_ac_student_a@test.com', name: 'AC Student A', uin: 'AC001' };
const STUDENT_B = { uid: 'e2e_ac_student_b@test.com', name: 'AC Student B', uin: 'AC002' };

const ASSESSMENT_TITLE = 'Access Control Test';
const ASSESSMENT_DIR = 'courseInstances/Sp15/assessments/hw-accessControl';

async function writeAssessmentConfig(
  testCoursePath: string,
  accessControl: Record<string, unknown>[],
) {
  const configPath = path.join(testCoursePath, ASSESSMENT_DIR, 'infoAssessment.json');
  const config = {
    uuid: 'f5b2c8d1-9a3e-4f7b-8c1d-2e5a6b9c0d1f',
    type: 'Homework',
    title: ASSESSMENT_TITLE,
    set: 'Homework',
    number: '14',
    accessControl,
    zones: [{ title: 'Access Control Test Zone', questions: [{ id: 'addNumbers', points: 1 }] }],
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

test.describe.serial('Student access control', () => {
  let originalConfig: string;

  test.beforeAll(async ({ testCoursePath, courseInstance }) => {
    // Save original assessment config for restoration
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
    const labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const sectionALabel = labels.find((l) => l.name === 'Section A');
    if (sectionALabel && enrollmentA) {
      await addLabelToEnrollment({
        enrollment: enrollmentA,
        label: sectionALabel,
        authzData,
      });
    }
  });

  test.afterAll(async ({ testCoursePath }) => {
    const configPath = path.join(testCoursePath, ASSESSMENT_DIR, 'infoAssessment.json');
    await fs.writeFile(configPath, originalConfig);
    await syncCourse(testCoursePath);
  });

  test('blockAccess: true hides assessment from student list', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [
      {
        blockAccess: true,
        dateControl: {
          releaseDate: '2020-01-01T00:00:00',
          dueDate: '2099-01-01T00:00:00',
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await page.context().addCookies([
      { name: 'pl2_requested_uid', value: STUDENT_A.uid, url: baseURL },
      { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
    ]);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    await expect(page.getByText(ASSESSMENT_TITLE)).not.toBeVisible();
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
        blockAccess: false,
        dateControl: {
          releaseDate: '2099-06-01T00:00:00',
          dueDate: '2099-12-01T00:00:00',
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await page.context().addCookies([
      { name: 'pl2_requested_uid', value: STUDENT_A.uid, url: baseURL },
      { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
    ]);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    // The assessment title should be visible but not as a link
    await expect(page.getByText(ASSESSMENT_TITLE)).toBeVisible();
    const assessmentLink = page.getByRole('link', { name: ASSESSMENT_TITLE });
    await expect(assessmentLink).not.toBeVisible();

    // "Opens soon" text should be visible
    await expect(page.getByText('Opens soon')).toBeVisible();
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
        blockAccess: false,
        dateControl: {
          releaseDate: '2020-01-01T00:00:00',
          dueDate: '2099-01-01T00:00:00',
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await page.context().addCookies([
      { name: 'pl2_requested_uid', value: STUDENT_A.uid, url: baseURL },
      { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
    ]);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    const assessmentLink = page.getByRole('link', { name: ASSESSMENT_TITLE });
    await expect(assessmentLink).toBeVisible();
    await expect(assessmentLink).toHaveAttribute('href', /\/assessment\/\d+/);
  });

  test('blockAccess override blocks labeled student, not unlabeled', async ({
    page,
    baseURL,
    courseInstance,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('enhanced-access-control');
    await writeAssessmentConfig(testCoursePath, [
      {
        blockAccess: false,
        dateControl: {
          releaseDate: '2020-01-01T00:00:00',
          dueDate: '2099-01-01T00:00:00',
        },
      },
      {
        labels: ['Section A'],
        blockAccess: true,
      },
    ]);
    await syncCourse(testCoursePath);

    // Student A is in "Section A" - should NOT see the assessment
    await page.context().addCookies([
      { name: 'pl2_requested_uid', value: STUDENT_A.uid, url: baseURL },
      { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
    ]);
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    await expect(page.getByText(ASSESSMENT_TITLE)).not.toBeVisible();

    // Student B is NOT in "Section A" - should see the assessment as a clickable link
    await page.context().addCookies([
      { name: 'pl2_requested_uid', value: STUDENT_B.uid, url: baseURL },
      { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
    ]);
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    const assessmentLink = page.getByRole('link', { name: ASSESSMENT_TITLE });
    await expect(assessmentLink).toBeVisible();
  });

  test('listBeforeRelease: false with future release shows assessment without "Opens soon"', async ({
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
        blockAccess: false,
        dateControl: {
          releaseDate: '2099-06-01T00:00:00',
          dueDate: '2099-12-01T00:00:00',
        },
      },
    ]);
    await syncCourse(testCoursePath);

    await page.context().addCookies([
      { name: 'pl2_requested_uid', value: STUDENT_A.uid, url: baseURL },
      { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
    ]);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);

    // Assessment is visible but as plain text (not a link, since it's not active)
    await expect(page.getByText(ASSESSMENT_TITLE)).toBeVisible();
    const assessmentLink = page.getByRole('link', { name: ASSESSMENT_TITLE });
    await expect(assessmentLink).not.toBeVisible();

    // Unlike listBeforeRelease: true, "Opens soon" should NOT be shown
    await expect(page.getByText('Opens soon')).not.toBeVisible();
  });
});
