import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';

import { fetchCheerio } from './helperClient.js';
import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

let courseRepo: CourseRepoFixture;

function assessmentLiveDir() {
  return path.join(courseRepo.courseLiveDir, 'courseInstances', 'Fa18', 'assessments');
}

describe('Creating an assessment', { concurrent: false }, () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
  });

  afterAll(helperServer.after);

  test('create a new assessment without module', async () => {
    // Fetch the assessments page for the course instance
    const assessmentsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );

    assert.equal(assessmentsPageResponse.status, 200);

    // Create the new assessment without a module
    const assessmentCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_assessment',
          __csrf_token: assessmentsPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: assessmentsPageResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Title',
          aid: 'HW2',
          type: 'Homework',
          set: 'Practice Quiz',
        }),
      },
    );

    assert.equal(assessmentCreationResponse.status, 200);
    assert.equal(
      assessmentCreationResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/assessment/2/questions`,
    );
  });

  test('verify the assessment has the correct info', async () => {
    const assessmentLiveInfoPath = path.join(
      assessmentLiveDir(),
      'HW2', // Verify that the aid was used as the assessment folder's name
      'infoAssessment.json',
    );
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Test Title');
    assert.equal(assessmentInfo.type, 'Homework');
    assert.equal(assessmentInfo.set, 'Practice Quiz');
  });

  test('create new assessment with module', async () => {
    // Fetch the assessments page for the course instance
    const assessmentsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );

    assert.equal(assessmentsPageResponse.status, 200);

    // Create the new assessment with a module
    const assessmentCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_assessment',
          __csrf_token: assessmentsPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: assessmentsPageResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Title 3',
          aid: 'HW3',
          type: 'Homework',
          set: 'Practice Quiz',
          module: 'Module2',
        }),
      },
    );

    assert.equal(assessmentCreationResponse.status, 200);
    assert.equal(
      assessmentCreationResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/assessment/3/questions`,
    );
  });

  test('verify the assessment has the correct info, including the module', async () => {
    const assessmentLiveInfoPath = path.join(
      assessmentLiveDir(),
      'HW3', // Verify that the aid was used as the assessment folder's name
      'infoAssessment.json',
    );
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Test Title 3');
    assert.equal(assessmentInfo.type, 'Homework');
    assert.equal(assessmentInfo.set, 'Practice Quiz');
    assert.equal(assessmentInfo.module, 'Module2');
  });

  test('create new assessment with duplicate aid, title', async () => {
    // Fetch the assessments page for the course instance
    const assessmentsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );

    assert.equal(assessmentsPageResponse.status, 200);

    // Create the new assessment with a duplicate aid and title
    const assessmentCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_assessment',
          __csrf_token: assessmentsPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: assessmentsPageResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Title', // Same title as the first assessment
          aid: 'HW2', // Same aid as the first assessment
          type: 'Homework',
          set: 'Practice Quiz',
        }),
      },
    );

    assert.equal(assessmentCreationResponse.status, 200);
    assert.equal(
      assessmentCreationResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/assessment/4/questions`,
    );
  });

  test('verify that the title and aid had 2 appended to them', async () => {
    const assessmentLiveInfoPath = path.join(
      assessmentLiveDir(),
      'HW2_2', // Verify that the aid was used as the assessment folder's name
      'infoAssessment.json',
    );
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Test Title (2)'); // Verify that 2 was appended to the title
    assert.equal(assessmentInfo.type, 'Homework');
    assert.equal(assessmentInfo.set, 'Practice Quiz');
  });

  test('deduplicates titles only within the same assessment set', async () => {
    const assessmentsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );

    const firstCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_assessment',
          __csrf_token: assessmentsPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: assessmentsPageResponse.$('input[name=orig_hash]').val() as string,
          title: 'Shared title',
          aid: 'HW4',
          type: 'Homework',
          set: 'Lab',
        }),
      },
    );

    assert.equal(firstCreationResponse.status, 200);
    const firstAssessmentInfo = JSON.parse(
      await fs.readFile(path.join(assessmentLiveDir(), 'HW4', 'infoAssessment.json'), 'utf8'),
    );
    assert.equal(firstAssessmentInfo.title, 'Shared title');

    const secondAssessmentsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );
    const secondCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_assessment',
          __csrf_token: secondAssessmentsPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: secondAssessmentsPageResponse.$('input[name=orig_hash]').val() as string,
          title: 'Shared title',
          aid: 'HW5',
          type: 'Homework',
          set: 'Practice Quiz',
        }),
      },
    );

    assert.equal(secondCreationResponse.status, 200);
    const secondAssessmentInfo = JSON.parse(
      await fs.readFile(path.join(assessmentLiveDir(), 'HW5', 'infoAssessment.json'), 'utf8'),
    );
    assert.equal(secondAssessmentInfo.title, 'Shared title');
  });

  test('does not suffix a unique aid when the title is duplicated in its set', async () => {
    const assessmentsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );

    const assessmentCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_assessment',
          __csrf_token: assessmentsPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: assessmentsPageResponse.$('input[name=orig_hash]').val() as string,
          title: 'Shared title',
          aid: 'HW6',
          type: 'Homework',
          set: 'Practice Quiz',
        }),
      },
    );

    assert.equal(assessmentCreationResponse.status, 200);
    const assessmentInfo = JSON.parse(
      await fs.readFile(path.join(assessmentLiveDir(), 'HW6', 'infoAssessment.json'), 'utf8'),
    );
    assert.equal(assessmentInfo.title, 'Shared title (2)');
  });

  test('should not be able to create an assessment without fields', async () => {
    // Fetch the assessments page for the course instance
    const assessmentsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );

    assert.equal(assessmentsPageResponse.status, 200);

    // Create a new assessment without a module
    const assessmentCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_assessment',
          __csrf_token: assessmentsPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: assessmentsPageResponse.$('input[name=orig_hash]').val() as string,
        }),
      },
    );

    assert.equal(assessmentCreationResponse.status, 400);
    assert.equal(
      assessmentCreationResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );
  });

  test('should not be able to create an assessment with aid not contained in the root directory', async () => {
    // Fetch the assessments page for the course instance
    const assessmentsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );

    assert.equal(assessmentsPageResponse.status, 200);

    // Create a new assessment with aid that is not contained in the root directory
    const assessmentCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_assessment',
          __csrf_token: assessmentsPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: assessmentsPageResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Assessment',
          aid: '../test-assessment',
          type: 'Homework',
          set: 'Practice Quiz',
        }),
      },
    );

    assert.equal(assessmentCreationResponse.status, 400);
    assert.equal(
      assessmentCreationResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/assessments`,
    );
  });
});
