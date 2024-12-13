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
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
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
      'Fa19', // This verifies that the short_name has been used as the directory name
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019');
    assert.equal(courseInstanceInfo.allowAccess.length, 1);
    assert.equal(courseInstanceInfo.allowAccess[0].startDate, '2021-01-01 00:00:00');
    assert.equal(courseInstanceInfo.allowAccess[0].endDate, '2021-01-02 00:00:00');
  });

  step('add course instance with the same long_name, different short_name', async () => {
    // Duplicate long_name/short_name handling logic is as follows:
    // If the long_name or short_name was used in a previous course instance in the course,
    // find the highest number appended to long_name or short_name (if no number was appended, the number is considered 1)
    // and append that number plus one to the new course instance's long_name and short_name.

    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Create the new course instance with the same long_name as the first one
    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val() as string,
          short_name: 'Fall19', // Different short_name from the first course instance, which had Fa19
          long_name: 'Fall 2019', // Same long_name as the first course instance
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
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
      'Fall19_2', // This verifies that the short_name had _2 appended to it
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019 (2)'); // This verifies that the long_name had (2) appended to it
  });

  step('add another course instance with the same long_name, different short_name', async () => {
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
          short_name: 'Fall_19', // Different short_name from the first and second course instances
          long_name: 'Fall 2019', // Same long_name as the first and second course instances
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        }),
      },
    );
    assert.equal(courseInstanceCreationResponse.status, 200);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/4/instructor/instance_admin/assessments`,
    );
  });

  step('verify short_name, long_name had 3 appended', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fall_19_3', // This verifies that the short_name had _3 appended to it
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019 (3)'); // This verifies that the long_name had (3) appended to it
  });

  step('add course instance with the same short_name, different long_name', async () => {
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
          short_name: 'Fa19', // Same short_name as the first course instance
          long_name: 'Fall 2019 Section 1', // Different long_name from the first course instance
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 200);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/5/instructor/instance_admin/assessments`,
    );
  });

  step('verify short_name, long_name had 4 appended', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa19_4', // This verifies that the short_name had _4 appended to it
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019 Section 1 (4)'); // This verifies that the long_name had (4) appended to it
  });

  step('add another course instance with the same short_name, different long_name', async () => {
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
          short_name: 'Fa19', // Same short_name as the first and fourth course instances
          long_name: 'Fall 2019 Section 2', // Different long_name from any other course instance
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 200);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/6/instructor/instance_admin/assessments`,
    );
  });

  step('verify short_name, long_name had 5 appended', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa19_5', // This verifies that the short_name had _5 appended to it
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019 Section 2 (5)'); // This verifies that the long_name had (5) appended to it
  });

  step('add course instance with the same short_name, long_name', async () => {
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
          short_name: 'Fa19', // Same short_name as the first, fourth, and fifth course instances
          long_name: 'Fall 2019', // Same long_name as the first, second, and third course instances
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 200);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/7/instructor/instance_admin/assessments`,
    );
  });

  step('verify short_name, long_name had 6 appended', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa19_6', // This verifies that the short_name had _6 appended to it
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019 (6)'); // This verifies that the long_name had (6) appended to it
  });

  step('should not be able to create course instance with start date after end date', async () => {
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
          long_name: 'Fall 2019',
          start_access_date: '2021-01-02T00:00',
          end_access_date: '2021-01-01T00:00',
        }),
      },
    );

    assert.match(courseInstanceCreationResponse.url, /\/pl\/course\/1\/edit_error\/\d+$/);
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
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
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
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );
  });
});
