import * as path from 'path';

import { assert } from 'chai';
import { execa } from 'execa';
import fs from 'fs-extra';
import { step } from 'mocha-steps';
import * as tmp from 'tmp';

import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { config } from '../lib/config.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;

const sql = loadSqlEquiv(import.meta.url);

const baseDir = tmp.dirSync().name;

const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseInstancesCourseLiveDir = path.join(courseLiveDir, 'courseInstances');

const courseDevDir = path.join(baseDir, 'courseDev');
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

describe('Creating a course instance', () => {
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

  step('create a new course instance', async () => {
    // Fetch the course instance page for the course
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Create the new course instance
    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val() as string,
          short_name: 'Fa19',
          long_name: 'Fall 2019',
          start_access_date: '2021-01-01T00:00:00',
          end_access_date: '2021-01-02T00:00:00',
          access_dates_enabled: 'on',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 200);

    // Verify that the user is redirected to the assessments page for the new course instance
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/2/instructor/instance_admin/assessments`,
    );
  });

  step('verify course instance has the correct info', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa19', // Verify that the short_name has been used as the course instance folder's name
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019');
    assert.equal(courseInstanceInfo.allowAccess.length, 1);
    assert.equal(courseInstanceInfo.allowAccess[0].startDate, '2021-01-01 00:00:00');
    assert.equal(courseInstanceInfo.allowAccess[0].endDate, '2021-01-02 00:00:00');
  });

  step('add course instance with the same long_name and short_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Create the new course instance with the same short_name and long_name as the first one
    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val() as string,
          short_name: 'Fa19', // Same short_name as the first course instance
          long_name: 'Fall 2019', // Same long_name as the first course instance
          start_access_date: '2021-01-01T00:00:00',
          end_access_date: '2021-01-02T00:00:00',
          access_dates_enabled: 'on',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 200);

    // Verify that the user is redirected to the assessments page for the new course instance
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/3/instructor/instance_admin/assessments`,
    );
  });

  step('verify that the new course instance names had 2 appended to them', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa19_2',
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019 (2)');
  });

  step('add course instance without start_access_date and end_access_date', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Create the new course instance without a start_access_date and end_access_date
    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val() as string,
          short_name: 'Fa20',
          long_name: 'Fall 2020',
          access_dates_enabled: 'on',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 200);

    // Verify that the user is redirected to the assessments page for the new course instance
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/4/instructor/instance_admin/assessments`,
    );
  });

  step('verify course instance is created with an empty allowAccess array', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa20',
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2020');

    assert.equal(courseInstanceInfo.allowAccess.length, 0);
  });

  step('add course instance with access_dates_enabled unchecked', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Create the new course instance with access_dates_enabled not specified (unchecked)
    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val() as string,
          short_name: 'Sp21',
          long_name: 'Spring 2021',
          start_access_date: '2021-01-01T00:00:00',
          end_access_date: '2021-01-02T00:00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 200);

    // Verify that the user is redirected to the assessments page for the new course instance
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/5/instructor/instance_admin/assessments`,
    );
  });

  step('verify course instance is created with an empty allowAccess array', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Sp21',
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Spring 2021');

    assert.equal(courseInstanceInfo.allowAccess.length, 0);
  });

  step('should not be able to create course instance with no short_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val() as string,
          // No short_name specified
          long_name: 'Fall 2019',
          start_access_date: '2021-01-01T00:00:00',
          end_access_date: '2021-01-02T00:00:00',
          access_dates_enabled: 'on',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );
  });

  step('should not be able to create course instance with no long_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val() as string,
          short_name: 'Fa19',
          // No long_name specified
          start_access_date: '2021-01-01T00:00:00',
          end_access_date: '2021-01-02T00:00:00',
          access_dates_enabled: 'on',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );
  });

  step(
    'should not be able to create course instance with short_name that falls outside correct root directory',
    async () => {
      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/instances`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      // Create the new course instance with a short_name that falls outside the correct root directory
      const courseInstanceCreationResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
            orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val() as string,
            short_name: '../Fa26',
            long_name: 'Fall 2026',
            access_dates_enabled: 'on',
          }),
        },
      );

      assert.equal(courseInstanceCreationResponse.status, 200);
      assert.match(courseInstanceCreationResponse.url, /\/pl\/course\/1\/edit_error\/\d+$/);
    },
  );
});
