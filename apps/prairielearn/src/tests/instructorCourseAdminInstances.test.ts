import * as path from 'path';

import { execa } from 'execa';
import fs from 'fs-extra';
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
const courseInstancesCourseLiveDir = path.join(courseLiveDir, 'courseInstances');

const courseDevDir = path.join(baseDir, 'courseDev');
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

const getCourseInstanceFileContents = async (shortName: string) => {
  const courseInstanceInfoPath = path.join(
    courseInstancesCourseLiveDir,
    shortName,
    'infoCourseInstance.json',
  );
  return await fs.readFile(courseInstanceInfoPath, 'utf8');
};

describe('Creating a course instance', () => {
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

    await fs.copy(courseTemplateDir, courseLiveDir);

    const execOptions = { cwd: courseLiveDir, env: process.env };
    await execa('git', ['add', '-A'], execOptions);
    await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
    await execa('git', ['push', 'origin', 'master'], execOptions);
    await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });

    await helperServer.before(courseLiveDir)();

    await execute(sql.update_course_repo, { repo: courseOriginDir });
  });

  afterAll(helperServer.after);

  test.sequential('create a new course instance', async () => {
    // Fetch the course instance page for the course
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Create the new course instance
    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          short_name: 'Fa19',
          long_name: 'Fall 2019',
          start_date: '2021-01-01T00:00:00',
          end_date: '2021-01-02T00:00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 200);

    // Verify that the response contains the new course instance ID
    const responseBody = await courseInstanceCreationResponse.json();
    assert.equal(responseBody.course_instance_id, '2');
  });

  test.sequential('verify course instance has the correct info', async () => {
    const courseInstanceInfo = JSON.parse(await getCourseInstanceFileContents('Fa19'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019');
    assert.equal(courseInstanceInfo.publishing.startDate, '2021-01-01T00:00:00');
    assert.equal(courseInstanceInfo.publishing.endDate, '2021-01-02T00:00:00');
  });
  test.sequential('add the same course instance again', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          short_name: 'Fa19',
          long_name: 'Fall 2019',
          start_date: '2021-01-01T00:00:00',
          end_date: '2021-01-02T00:00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    const responseBody = await courseInstanceCreationResponse.json();
    assert.isDefined(responseBody.error);
  });

  test.sequential('add course instance without start_access_date and end_access_date', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Create the new course instance without a start_access_date and end_access_date
    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          short_name: 'Fa20',
          long_name: 'Fall 2020',
          start_date: '',
          end_date: '',
        }),
      },
    );

    const responseBody = await courseInstanceCreationResponse.json();

    assert.equal(courseInstanceCreationResponse.status, 200);

    assert.equal(responseBody.course_instance_id, '3');
  });

  test.sequential('verify course instance is created without publishing config', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa20',
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2020');

    assert.isUndefined(courseInstanceInfo.publishing);
  });

  test.sequential('should not be able to create course instance with no short_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          // No short_name specified
          short_name: '',
          long_name: 'Fall 2019',
          start_date: '2021-01-01T00:00:00',
          end_date: '2021-01-02T00:00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    const responseBody = await courseInstanceCreationResponse.json();
    assert.isDefined(responseBody.error);
  });

  test.sequential('should not be able to create course instance with no long_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          short_name: 'Sp21',
          // No long_name specified
          long_name: '',
          start_date: '2021-01-01T00:00:00',
          end_date: '2021-01-02T00:00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    const responseBody = await courseInstanceCreationResponse.json();
    assert.isDefined(responseBody.error);
  });

  test.sequential(
    'should not be able to create course instance with short_name that falls outside correct root directory',
    async () => {
      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/instances`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      // Create the new course instance with a short_name that falls outside the correct root directory
      const courseInstanceCreationResponse = await fetch(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
            short_name: '../Fa26', // Try to do a path traversal attack
            long_name: 'Fall 2026',
            start_date: '',
            end_date: '',
          }),
        },
      );

      const responseBody = await courseInstanceCreationResponse.json();
      assert.equal(courseInstanceCreationResponse.status, 400);
      assert.isDefined(responseBody.error);
    },
  );

  test.sequential(
    'should not be able to add another course instance that causes an edit error',
    async () => {
      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/instances`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      const courseInstanceCreationResponse = await fetch(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
            short_name: 'Fa19_2',
            long_name: 'Fall 2019 (2)',
            start_date: '', // It is invalid to specify an end date without a start date
            end_date: '2021-01-02T00:00:00',
          }),
        },
      );
      const responseBody = await courseInstanceCreationResponse.json();

      assert.equal(courseInstanceCreationResponse.status, 400);

      // This implies an edit error was thrown, and the client will redirect to it.
      assert.isDefined(responseBody.job_sequence_id);

      // Any tests after this one are going to also fail with a edit error.
    },
  );
});
