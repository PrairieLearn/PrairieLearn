import * as path from 'path';

import { assert } from 'chai';
import { execa } from 'execa';
import * as tmp from 'tmp';
import fs from 'fs-extra';

import * as helperServer from './helperServer.js';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import { step } from 'mocha-steps';
import { fetchCheerio } from './helperClient.js';
import { config } from '../lib/config.js';

const siteUrl = `http://localhost:${config.serverPort}`;

const sql = loadSqlEquiv(import.meta.url);

const baseDir = tmp.dirSync().name;

const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseInstancesCourseLiveDir = path.join(courseLiveDir, 'courseInstances');

const courseDevDir = path.join(baseDir, 'courseDev');
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

describe('Updating a course instance ID', () => {
  before(async () => {
    // Clone the course template for testing
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
      cwd: '.',
      env: process.env,
    });

    await execa('git', ['clone', courseOriginDir, courseLiveDir], {
      cwd: '.',
      env: process.env,
    });

    await fs.copy(courseTemplateDir, courseLiveDir);

    const execOptions = { cwd: courseLiveDir, env: process.env };
    await execa('git', ['add', '-A'], execOptions);
    await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
    await execa('git', ['push', 'origin', 'master'], execOptions);
    await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });

    await helperServer.before(courseLiveDir)();

    await queryAsync(sql.update_course_repo, { repo: courseOriginDir });
  });

  after(helperServer.after);

  step('change course instance id with valid id', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Update the course instance to have a short_name that is valid
    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'change_id',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          id: 'Sp23',
          access_dates_enabled: 'on',
        }),
      },
    );

    console.log('Response Status: ', courseInstanceCreationResponse.status);
    console.log('Response body: ', await courseInstanceCreationResponse.text());

    assert.equal(courseInstanceCreationResponse.status, 200);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
    );
  });

  step('verify course instance id changed', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Sp23', // This validates that the course instance id was updated
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    // If courseInstanceInfo is populated, the course instance id was successfully changed
    assert.isNotNull(courseInstanceInfo);
  });

  step(
    'should not be able to change course instance id to short name that falls outside correct root directory',
    async () => {
      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      // Attempt to update the course instance to have a short_name that falls outside the correct root directory
      // It should fail
      const courseInstanceCreationResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'course_id',
            __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
            short_name: '../Fa25',
            long_name: 'Fall 2025',
            access_dates_enabled: 'on',
          }),
        },
      );

      assert.equal(courseInstanceCreationResponse.status, 400);
      assert.equal(
        courseInstanceCreationResponse.url,
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
      );
    },
  );
});
