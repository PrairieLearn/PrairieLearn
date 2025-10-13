import * as path from 'path';

import { execa } from 'execa';
import * as fs from 'node:fs/promises';
import { copy } from 'fs-extra';
import * as tmp from 'tmp';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { config } from '../lib/config.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;

const sql = loadSqlEquiv(import.meta.url);

const baseDir = tmp.dirSync().name;

const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const assessmentLiveDir = path.join(courseLiveDir, 'courseInstances', 'Fa18', 'assessments');

const courseDevDir = path.join(baseDir, 'courseDev');
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

describe('Creating an assessment', () => {
  beforeAll(async () => {
    // Clone the course template for testing
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
      cwd: '.',
      env: process.env,
    });

    await execa('git', ['clone', courseOriginDir, courseLiveDir], {
      cwd: '.',
      env: process.env,
    });

    await copy(courseTemplateDir, courseLiveDir);

    const execOptions = { cwd: courseLiveDir, env: process.env };
    await execa('git', ['add', '-A'], execOptions);
    await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
    await execa('git', ['push', 'origin', 'master'], execOptions);
    await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });

    await helperServer.before(courseLiveDir)();

    await execute(sql.update_course_repo, { repo: courseOriginDir });
  });

  afterAll(helperServer.after);

  test.sequential('create a new assessment without module', async () => {
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

  test.sequential('verify the assessment has the correct info', async () => {
    const assessmentLiveInfoPath = path.join(
      assessmentLiveDir,
      'HW2', // Verify that the aid was used as the assessment folder's name
      'infoAssessment.json',
    );
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Test Title');
    assert.equal(assessmentInfo.type, 'Homework');
    assert.equal(assessmentInfo.set, 'Practice Quiz');
  });

  test.sequential('create new assessment with module', async () => {
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

  test.sequential('verify the assessment has the correct info, including the module', async () => {
    const assessmentLiveInfoPath = path.join(
      assessmentLiveDir,
      'HW3', // Verify that the aid was used as the assessment folder's name
      'infoAssessment.json',
    );
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Test Title 3');
    assert.equal(assessmentInfo.type, 'Homework');
    assert.equal(assessmentInfo.set, 'Practice Quiz');
    assert.equal(assessmentInfo.module, 'Module2');
  });

  test.sequential('create new assessment with duplicate aid, title', async () => {
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

  test.sequential('verify that the title and aid had 2 appended to them', async () => {
    const assessmentLiveInfoPath = path.join(
      assessmentLiveDir,
      'HW2_2', // Verify that the aid was used as the assessment folder's name
      'infoAssessment.json',
    );
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Test Title (2)'); // Verify that 2 was appended to the title
    assert.equal(assessmentInfo.type, 'Homework');
    assert.equal(assessmentInfo.set, 'Practice Quiz');
  });

  test.sequential('should not be able to create an assessment without fields', async () => {
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

  test.sequential(
    'should not be able to create an assessment with aid not contained in the root directory',
    async () => {
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
    },
  );
});
